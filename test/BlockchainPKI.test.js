// test/BlockchainPKI.test.js
//
// Automated tests for the BlockchainPKI contract.
// Run them with:   npx hardhat test
//
// ─── HOW TO READ THIS FILE ─────────────────────────────────────────────
//   describe(...)   groups related tests under a heading
//   it(...)         is one individual test case
//   beforeEach(...) runs before EVERY test, deploying a fresh contract so
//                   no test can be affected by another one
//   expect(x).to.equal(y)            passes if x equals y
//   await expect(tx).to.be.revertedWith("msg")
//                   passes if the transaction FAILS with that exact error.
//                   This is how you prove your security rules work.
//
// Hardhat gives you 20 pre-funded fake accounts. We use three of them as
// Alice, Bob and Carol.
// ───────────────────────────────────────────────────────────────────────

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BlockchainPKI", function () {

  let pki;                    // the deployed contract
  let alice, bob, carol;      // test accounts

  const KEY_A = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_ALICE_TEST_PUBLIC_KEY";
  const KEY_B = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_BOB_TEST_PUBLIC_KEY";
  const KEY_C = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_CAROL_TEST_PUBLIC_KEY";

  const ONE_YEAR = 365;

  beforeEach(async function () {
    [alice, bob, carol] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BlockchainPKI");
    pki = await Factory.deploy();
    await pki.waitForDeployment();
  });

  // ═══════════════════════════════════════════════════════════════════
  describe("Deployment", function () {

    it("starts with zero certificates", async function () {
      expect(await pki.totalCertificates()).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  describe("Issuance", function () {

    it("issues a certificate and assigns ID 1", async function () {
      await pki.connect(alice).issueCertificate("Alice", KEY_A, ONE_YEAR);
      expect(await pki.totalCertificates()).to.equal(1);

      const cert = await pki.getCertificate(1);
      expect(cert.id).to.equal(1);
      expect(cert.subjectName).to.equal("Alice");
      expect(cert.publicKey).to.equal(KEY_A);
      expect(cert.revoked).to.equal(false);
    });

    it("records the caller as the owner", async function () {
      // Bob issues this one, so Bob must own it — not the deployer.
      await pki.connect(bob).issueCertificate("Bob", KEY_B, ONE_YEAR);
      const cert = await pki.getCertificate(1);
      expect(cert.owner).to.equal(bob.address);
    });

    it("rejects a duplicate public key", async function () {
      await pki.connect(alice).issueCertificate("Alice", KEY_A, ONE_YEAR);
      await expect(
        pki.connect(bob).issueCertificate("Bob", KEY_A, ONE_YEAR)
      ).to.be.revertedWith("Public key already registered");
    });

    it("rejects an empty subject name", async function () {
      await expect(
        pki.connect(alice).issueCertificate("", KEY_A, ONE_YEAR)
      ).to.be.revertedWith("Subject name required");
    });

    it("rejects zero-day validity", async function () {
      await expect(
        pki.connect(alice).issueCertificate("Alice", KEY_A, 0)
      ).to.be.revertedWith("Validity must be 1-3650 days");
    });

    it("rejects validity over 3650 days", async function () {
      await expect(
        pki.connect(alice).issueCertificate("Alice", KEY_A, 3651)
      ).to.be.revertedWith("Validity must be 1-3650 days");
    });

    it("emits CertificateIssued", async function () {
      await expect(pki.connect(alice).issueCertificate("Alice", KEY_A, ONE_YEAR))
        .to.emit(pki, "CertificateIssued");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  describe("Verification", function () {

    it("reports a fresh certificate as VALID", async function () {
      await pki.connect(alice).issueCertificate("Alice", KEY_A, ONE_YEAR);
      const [valid, status, owner, subject] = await pki.verifyCertificate(1);

      expect(valid).to.equal(true);
      expect(status).to.equal("VALID");
      expect(owner).to.equal(alice.address);
      expect(subject).to.equal("Alice");
    });

    it("reports an unknown ID as NOT_FOUND", async function () {
      const [valid, status] = await pki.verifyCertificate(999);
      expect(valid).to.equal(false);
      expect(status).to.equal("NOT_FOUND");
    });

    it("reports an expired certificate as EXPIRED", async function () {
      // Issue a certificate valid for one day…
      await pki.connect(alice).issueCertificate("Alice", KEY_A, 1);

      // …then fast-forward the blockchain's clock by two days.
      // This is the single best reason to use Hardhat: you cannot test
      // expiry any other way without literally waiting.
      await time.increase(2 * 24 * 60 * 60);

      const [valid, status] = await pki.verifyCertificate(1);
      expect(valid).to.equal(false);
      expect(status).to.equal("EXPIRED");
    });

    it("finds a certificate by fingerprint", async function () {
      await pki.connect(alice).issueCertificate("Alice", KEY_A, ONE_YEAR);
      const fp = await pki.computeFingerprint(KEY_A);

      const [valid, id] = await pki.verifyByFingerprint(fp);
      expect(valid).to.equal(true);
      expect(id).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  describe("Revocation", function () {

    beforeEach(async function () {
      await pki.connect(alice).issueCertificate("Alice", KEY_A, ONE_YEAR);
    });

    it("lets the owner revoke", async function () {
      await pki.connect(alice).revokeCertificate(1, "Private key compromised");

      const cert = await pki.getCertificate(1);
      expect(cert.revoked).to.equal(true);
      expect(cert.revocationReason).to.equal("Private key compromised");
    });

    it("blocks a non-owner from revoking", async function () {
      // ★ This test proves the decentralisation claim. Bob has no power
      //   over Alice's certificate, and neither does anyone else — there
      //   is no admin role in the contract at all.
      await expect(
        pki.connect(bob).revokeCertificate(1, "malicious")
      ).to.be.revertedWith("Only owner can revoke");
    });

    it("blocks double revocation", async function () {
      await pki.connect(alice).revokeCertificate(1, "first");
      await expect(
        pki.connect(alice).revokeCertificate(1, "second")
      ).to.be.revertedWith("Already revoked");
    });

    it("reports a revoked certificate as REVOKED", async function () {
      await pki.connect(alice).revokeCertificate(1, "Key compromised");
      const [valid, status] = await pki.verifyCertificate(1);

      expect(valid).to.equal(false);
      expect(status).to.equal("REVOKED");
    });

    it("emits CertificateRevoked", async function () {
      await expect(pki.connect(alice).revokeCertificate(1, "Key compromised"))
        .to.emit(pki, "CertificateRevoked");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  describe("Ownership", function () {

    it("lists all certificates owned by an address", async function () {
      await pki.connect(alice).issueCertificate("Alice Work",     KEY_A, ONE_YEAR);
      await pki.connect(alice).issueCertificate("Alice Personal", KEY_B, ONE_YEAR);
      await pki.connect(bob).issueCertificate("Bob",              KEY_C, ONE_YEAR);

      const aliceCerts = await pki.getCertificatesByOwner(alice.address);
      const bobCerts   = await pki.getCertificatesByOwner(bob.address);

      expect(aliceCerts.length).to.equal(2);
      expect(bobCerts.length).to.equal(1);
      expect(aliceCerts[0]).to.equal(1);
      expect(aliceCerts[1]).to.equal(2);
      expect(bobCerts[0]).to.equal(3);
    });
  });
});
