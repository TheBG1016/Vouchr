import { Contract, JsonRpcProvider } from "ethers";
import { CHAIN_ID, CONTRACT_ADDRESS, RPC_URL } from "./config";
import { db } from "./db";
import { HttpError } from "./http";

const ABI = [
  "function getCertificate(uint256 id) view returns (tuple(uint256 id, address owner, string subjectName, string publicKey, bytes32 fingerprint, uint256 issuedAt, uint256 expiresAt, bool revoked, string revocationReason))",
  "function verifyCertificate(uint256 id) view returns (bool valid, string status, address owner, string subjectName, string publicKey)",
  "function totalCertificates() view returns (uint256)",
];

let contract;
export function chainContract() {
  contract ||= new Contract(CONTRACT_ADDRESS, ABI, new JsonRpcProvider(RPC_URL));
  return contract;
}

export async function certificateById(id) {
  try {
    const c = await chainContract().getCertificate(id);
    return {
      id: c.id.toString(),
      owner: c.owner.toLowerCase(),
      subjectName: c.subjectName,
      publicKey: c.publicKey,
      fingerprint: c.fingerprint,
      issuedAt: Number(c.issuedAt),
      expiresAt: Number(c.expiresAt),
      revoked: c.revoked,
      revocationReason: c.revocationReason,
    };
  } catch (error) {
    if (error.code === "CALL_EXCEPTION") return null;
    throw error;
  }
}

export async function requireCertificateOwner(id, address) {
  const cert = await certificateById(id);
  if (!cert) throw new HttpError(404, "Certificate not found on Sepolia");
  if (cert.owner !== address.toLowerCase()) {
    throw new HttpError(403, "Only the certificate owner can attach a file");
  }
  return cert;
}

export async function verifyOnChain(id) {
  const result = await chainContract().verifyCertificate(id);
  return {
    valid: result.valid,
    status: result.status,
    owner: result.owner.toLowerCase(),
    subjectName: result.subjectName,
    publicKey: result.publicKey,
  };
}

export async function syncCertificateIndex(limit = 30) {
  const sql = db();
  const [progress] = await sql`
    SELECT COALESCE(max(cert_id), 0)::bigint AS last_id
    FROM certificates_index
    WHERE chain_id = ${CHAIN_ID} AND contract_address = ${CONTRACT_ADDRESS}
  `;
  const total = Number(await chainContract().totalCertificates());
  const lastId = Number(progress.last_id);
  const end = Math.min(total, lastId + limit);
  for (let start = lastId + 1; start <= end; start += 5) {
    const ids = Array.from({ length: Math.min(5, end - start + 1) }, (_, i) => start + i);
    const certs = await Promise.all(ids.map(id => certificateById(id)));
    for (const c of certs) {
      if (!c) continue;
      await sql`
        INSERT INTO certificates_index
          (chain_id, contract_address, cert_id, owner_address, subject_name,
           fingerprint, issued_at, expires_at)
        VALUES (${CHAIN_ID}, ${CONTRACT_ADDRESS}, ${c.id}, ${c.owner},
          ${c.subjectName}, ${c.fingerprint},
          ${new Date(c.issuedAt * 1000).toISOString()},
          ${new Date(c.expiresAt * 1000).toISOString()})
        ON CONFLICT (chain_id, contract_address, cert_id) DO NOTHING
      `;
    }
  }
  return { indexedThrough: end, total };
}
