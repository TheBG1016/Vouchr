import { HttpError } from "./http";

export function requirePublicKey(value) {
  if (!value || value.kty !== "RSA" || value.e !== "AQAB" ||
      typeof value.n !== "string" || value.n.length < 500 || value.n.length > 520 ||
      ["d", "p", "q", "dp", "dq", "qi"].some(field => field in value)) {
    throw new HttpError(400, "Invalid public encryption key");
  }
  return { kty: "RSA", e: "AQAB", n: value.n, alg: "RSA-OAEP-256", ext: true };
}

export function requireSealedKey(value) {
  if (!value || value.kdf !== "PBKDF2-SHA256" || value.iterations !== 600000 ||
      !isBase64(value.salt, 16) || !isBase64(value.iv, 12) ||
      typeof value.ciphertext !== "string" || value.ciphertext.length < 500 ||
      value.ciphertext.length > 20000) {
    throw new HttpError(400, "Invalid encrypted private key");
  }
  return {
    kdf: value.kdf,
    iterations: value.iterations,
    salt: value.salt,
    iv: value.iv,
    ciphertext: value.ciphertext,
  };
}

export function isBase64(value, bytes) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
  try { return Buffer.from(value, "base64").length === bytes; }
  catch { return false; }
}

export function requireWrappedKey(value) {
  if (!isBase64(value, 384)) throw new HttpError(400, "Invalid wrapped file key");
  return value;
}

export function requireId(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) {
    throw new HttpError(400, "Invalid certificate ID");
  }
  return BigInt(value);
}
