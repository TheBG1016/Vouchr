// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  BlockchainPKI
 * @notice A decentralized Public Key Infrastructure.
 *
 *         Traditional PKI depends on Certificate Authorities. If a CA is
 *         compromised, every certificate it signed becomes untrustworthy.
 *         This contract removes the CA entirely.
 *
 *         DESIGN PRINCIPLE — NO ADMIN:
 *         There is deliberately no `owner`, no `onlyAdmin` modifier, and no
 *         privileged address anywhere in this contract. Any Ethereum address
 *         may issue a certificate for itself, and ONLY that same address may
 *         revoke it. Nobody — including the contract deployer — can revoke,
 *         alter or delete another party's certificate. This is what makes the
 *         system decentralized rather than a Certificate Authority with extra
 *         steps.
 *
 *         WHAT IS STORED ON CHAIN:
 *         Only PUBLIC keys. Private keys are generated in the user's browser
 *         and never transmitted. Everything written to a public blockchain is
 *         readable by everyone, so storing a private key here would completely
 *         destroy the security of the system.
 */
contract BlockchainPKI {

    // ---------------------------------------------------------------------
    // DATA STRUCTURES
    // ---------------------------------------------------------------------

    /// @notice A single digital certificate record.
    struct Certificate {
        uint256 id;               // Sequential certificate ID (starts at 1)
        address owner;            // The Ethereum address that issued & controls it
        string  subjectName;      // Human-readable subject, e.g. "Alice Kumar"
        string  publicKey;        // Base64-encoded SPKI public key
        bytes32 fingerprint;      // keccak256(publicKey) — cheap lookup index
        uint256 issuedAt;         // Block timestamp of issuance
        uint256 expiresAt;        // Block timestamp after which it is EXPIRED
        bool    revoked;          // Once true, permanently true
        string  revocationReason; // Free-text reason, set at revocation time
    }

    /// @dev Next ID to assign. Starts at 1 so that id == 0 reliably means
    ///      "does not exist" (Solidity zero-initialises all storage).
    uint256 private nextId = 1;

    /// @dev id => Certificate
    mapping(uint256 => Certificate) private certificates;

    /// @dev owner address => list of certificate IDs they issued
    mapping(address => uint256[]) private ownerToCertIds;

    /// @dev keccak256(publicKey) => certificate id. Prevents duplicate keys
    ///      and allows verification without knowing the ID.
    mapping(bytes32 => uint256) private fingerprintToId;

    // ---------------------------------------------------------------------
    // EVENTS
    //
    // Events are written to the transaction log. They are far cheaper than
    // storage, are permanently retained, and are what block explorers and
    // off-chain monitors read. Together they form an immutable, publicly
    // auditable Certificate Transparency log.
    // ---------------------------------------------------------------------

    event CertificateIssued(
        uint256 indexed id,
        address indexed owner,
        string  subjectName,
        bytes32 indexed fingerprint,
        uint256 issuedAt,
        uint256 expiresAt
    );

    event CertificateRevoked(
        uint256 indexed id,
        address indexed owner,
        string  reason,
        uint256 revokedAt
    );

    // ---------------------------------------------------------------------
    // WRITE FUNCTIONS (cost gas)
    // ---------------------------------------------------------------------

    /**
     * @notice Issue a new certificate for the caller.
     * @dev    Self-sovereign: msg.sender becomes the owner. No approval from
     *         any authority is required or possible.
     * @param  subjectName   Human-readable identity label.
     * @param  publicKey     Base64 SPKI public key generated client-side.
     * @param  validityDays  Lifetime in days (1 to 3650).
     * @return The new certificate's ID.
     */
    function issueCertificate(
        string calldata subjectName,
        string calldata publicKey,
        uint256 validityDays
    ) external returns (uint256) {

        require(bytes(subjectName).length > 0,   "Subject name required");
        require(bytes(subjectName).length <= 128, "Subject name too long");
        require(bytes(publicKey).length > 0,     "Public key required");
        require(
            validityDays > 0 && validityDays <= 3650,
            "Validity must be 1-3650 days"
        );

        // Hash the key once. Comparing bytes32 values is vastly cheaper than
        // comparing strings, which is why we index on the fingerprint.
        bytes32 fp = keccak256(abi.encodePacked(publicKey));
        require(fingerprintToId[fp] == 0, "Public key already registered");

        uint256 id = nextId;
        nextId++;

        uint256 expiry = block.timestamp + (validityDays * 1 days);

        certificates[id] = Certificate({
            id:               id,
            owner:            msg.sender,
            subjectName:      subjectName,
            publicKey:        publicKey,
            fingerprint:      fp,
            issuedAt:         block.timestamp,
            expiresAt:        expiry,
            revoked:          false,
            revocationReason: ""
        });

        ownerToCertIds[msg.sender].push(id);
        fingerprintToId[fp] = id;

        emit CertificateIssued(
            id, msg.sender, subjectName, fp, block.timestamp, expiry
        );

        return id;
    }

    /**
     * @notice Permanently revoke a certificate you own.
     * @dev    ACCESS CONTROL: the require on msg.sender is the single line
     *         that enforces decentralization. There is no override path.
     *         Revocation is irreversible by design — an "un-revoke" function
     *         would let an attacker who briefly gains key access restore a
     *         compromised certificate.
     * @param  id      The certificate to revoke.
     * @param  reason  Why (e.g. "Private key compromised").
     */
    function revokeCertificate(uint256 id, string calldata reason) external {
        Certificate storage c = certificates[id];

        require(c.id != 0,            "Certificate does not exist");
        require(c.owner == msg.sender, "Only owner can revoke");
        require(!c.revoked,            "Already revoked");

        c.revoked = true;
        c.revocationReason = reason;

        emit CertificateRevoked(id, msg.sender, reason, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // READ FUNCTIONS (view — these cost ZERO gas when called off-chain)
    //
    // This is a key point for the report: verification, which is by far the
    // most frequent operation in any PKI, is completely free. Only issuance
    // and revocation — rare, once-per-lifetime events — consume gas.
    // ---------------------------------------------------------------------

    /**
     * @notice Check a certificate's validity by ID.
     * @return valid        True only if it exists, is not revoked, and is not expired.
     * @return status       "VALID" | "REVOKED" | "EXPIRED" | "NOT_FOUND"
     * @return owner        The issuing address.
     * @return subjectName  Human-readable subject.
     * @return publicKey    The public key, so a caller can verify a signature.
     */
    function verifyCertificate(uint256 id)
        external
        view
        returns (
            bool   valid,
            string memory status,
            address owner,
            string memory subjectName,
            string memory publicKey
        )
    {
        Certificate memory c = certificates[id];

        if (c.id == 0) {
            return (false, "NOT_FOUND", address(0), "", "");
        }
        if (c.revoked) {
            return (false, "REVOKED", c.owner, c.subjectName, c.publicKey);
        }
        if (block.timestamp > c.expiresAt) {
            return (false, "EXPIRED", c.owner, c.subjectName, c.publicKey);
        }
        return (true, "VALID", c.owner, c.subjectName, c.publicKey);
    }

    /**
     * @notice Look up a certificate by the hash of its public key.
     * @dev    Lets a verifier who already holds a public key check its status
     *         without being told the certificate ID.
     */
    function verifyByFingerprint(bytes32 fingerprint)
        external
        view
        returns (bool valid, uint256 id)
    {
        uint256 cid = fingerprintToId[fingerprint];
        if (cid == 0) {
            return (false, 0);
        }
        Certificate memory c = certificates[cid];
        bool ok = !c.revoked && block.timestamp <= c.expiresAt;
        return (ok, cid);
    }

    /// @notice Retrieve the complete certificate record.
    function getCertificate(uint256 id)
        external
        view
        returns (Certificate memory)
    {
        require(certificates[id].id != 0, "Certificate does not exist");
        return certificates[id];
    }

    /// @notice All certificate IDs issued by a given address.
    function getCertificatesByOwner(address owner)
        external
        view
        returns (uint256[] memory)
    {
        return ownerToCertIds[owner];
    }

    /// @notice Total certificates ever issued (including revoked/expired).
    function totalCertificates() external view returns (uint256) {
        return nextId - 1;
    }

    /// @notice Helper so the frontend can compute a fingerprint identically.
    function computeFingerprint(string calldata publicKey)
        external
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(publicKey));
    }
}
