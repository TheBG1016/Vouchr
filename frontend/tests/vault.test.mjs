import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createVault,
  decryptAttachment,
  encryptAttachment,
  makeAdminKeyFile,
  rewrapForRecovery,
  unlockAdminKeyFile,
  unlockVault,
} from "../lib/vault.js";

test("private files open with the owner's password or the admin key, and recovery rewraps access", async () => {
  const owner = await createVault("owner-passphrase-123");
  const admin = await makeAdminKeyFile("admin-passphrase-123");
  const content = "Demo certificate attachment";
  const file = new File([content], "demo.txt", { type: "text/plain" });
  const encrypted = await encryptAttachment(
    file, owner.encryptionPublicKey, admin.encryptionPublicKey
  );
  const ciphertext = await encrypted.ciphertext.arrayBuffer();
  assert.notEqual(new TextDecoder().decode(ciphertext), content);

  const ownerKey = await unlockVault(owner.encryptedPrivateKey, "owner-passphrase-123");
  const openedByOwner = await decryptAttachment(
    ciphertext, encrypted.ownerWrappedKey, ownerKey, encrypted.iv, file.type
  );
  assert.equal(await openedByOwner.text(), content);
  await assert.rejects(unlockVault(owner.encryptedPrivateKey, "incorrect-password"));

  const adminKey = await unlockAdminKeyFile(admin, "admin-passphrase-123");
  const openedByAdmin = await decryptAttachment(
    ciphertext, encrypted.adminWrappedKey, adminKey, encrypted.iv, file.type
  );
  assert.equal(await openedByAdmin.text(), content);
  await assert.rejects(unlockAdminKeyFile(admin, "incorrect-password"));

  const otherUser = await createVault("other-passphrase-123");
  const otherKey = await unlockVault(otherUser.encryptedPrivateKey, "other-passphrase-123");
  await assert.rejects(decryptAttachment(
    ciphertext, encrypted.ownerWrappedKey, otherKey, encrypted.iv, file.type
  ));

  const damaged = ciphertext.slice(0);
  new Uint8Array(damaged)[0] ^= 1;
  await assert.rejects(decryptAttachment(
    damaged, encrypted.ownerWrappedKey, ownerKey, encrypted.iv, file.type
  ));

  const recovered = await createVault("new-owner-passphrase-123");
  const newWrap = await rewrapForRecovery(
    encrypted.adminWrappedKey, adminKey, recovered.encryptionPublicKey
  );
  const newOwnerKey = await unlockVault(
    recovered.encryptedPrivateKey, "new-owner-passphrase-123"
  );
  const openedAfterRecovery = await decryptAttachment(
    ciphertext, newWrap, newOwnerKey, encrypted.iv, file.type
  );
  assert.equal(await openedAfterRecovery.text(), content);
});
