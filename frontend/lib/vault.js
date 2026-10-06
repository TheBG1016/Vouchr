// This module runs only in the browser. Passwords and private keys never reach an API.
const encoder = new TextEncoder();
const ITERATIONS = 600000;

function toBase64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(text);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

async function passwordKey(password, salt, iterations = ITERATIONS) {
  const input = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    input,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function sealPrivateKey(privateKey, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt);
  const raw = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, raw
  ));
  raw.fill(0);
  return {
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

async function unsealPrivateKey(sealed, password) {
  const key = await passwordKey(password, fromBase64(sealed.salt), sealed.iterations);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    key,
    fromBase64(sealed.ciphertext)
  );
  try {
    return await crypto.subtle.importKey(
      "pkcs8", plain, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
    );
  } finally {
    new Uint8Array(plain).fill(0);
  }
}

export async function createVault(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Use at least 12 characters for the vault password.");
  }
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );
  return {
    encryptionPublicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
    encryptedPrivateKey: await sealPrivateKey(pair.privateKey, password),
  };
}

export async function unlockVault(sealed, password) {
  try { return await unsealPrivateKey(sealed, password); }
  catch { throw new Error("Incorrect vault password or damaged key data."); }
}

export async function makeAdminKeyFile(passphrase) {
  const vault = await createVault(passphrase);
  return {
    type: "vouchr-admin-document-key",
    version: 1,
    ...vault,
  };
}

export async function unlockAdminKeyFile(file, passphrase) {
  if (file?.type !== "vouchr-admin-document-key" || file?.version !== 1) {
    throw new Error("This is not a Vouchr admin document key file.");
  }
  return unlockVault(file.encryptedPrivateKey, passphrase);
}

export async function encryptAttachment(file, userPublicJwk, adminPublicJwk) {
  const [userKey, adminKey] = await Promise.all([userPublicJwk, adminPublicJwk].map(jwk =>
    crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"])
  ));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const contentKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", contentKey));
  try {
    const [ciphertext, ownerWrap, adminWrap] = await Promise.all([
      crypto.subtle.encrypt({ name: "AES-GCM", iv }, contentKey, await file.arrayBuffer()),
      crypto.subtle.encrypt({ name: "RSA-OAEP" }, userKey, rawKey),
      crypto.subtle.encrypt({ name: "RSA-OAEP" }, adminKey, rawKey),
    ]);
    return {
      ciphertext: new Blob([ciphertext], { type: "application/octet-stream" }),
      iv: toBase64(iv),
      ownerWrappedKey: toBase64(new Uint8Array(ownerWrap)),
      adminWrappedKey: toBase64(new Uint8Array(adminWrap)),
    };
  } finally {
    rawKey.fill(0);
  }
}

export async function decryptAttachment(ciphertext, wrappedKey, privateKey, iv, mimeType) {
  const rawKey = new Uint8Array(await crypto.subtle.decrypt(
    { name: "RSA-OAEP" }, privateKey, fromBase64(wrappedKey)
  ));
  try {
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) }, key, ciphertext
    );
    return new Blob([clear], { type: mimeType });
  } finally {
    rawKey.fill(0);
  }
}

export async function rewrapForRecovery(adminWrappedKey, adminPrivateKey, newUserPublicJwk) {
  const userKey = await crypto.subtle.importKey(
    "jwk", newUserPublicJwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
  );
  const rawKey = new Uint8Array(await crypto.subtle.decrypt(
    { name: "RSA-OAEP" }, adminPrivateKey, fromBase64(adminWrappedKey)
  ));
  try {
    return toBase64(new Uint8Array(await crypto.subtle.encrypt(
      { name: "RSA-OAEP" }, userKey, rawKey
    )));
  } finally {
    rawKey.fill(0);
  }
}
