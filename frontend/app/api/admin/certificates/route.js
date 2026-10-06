import { CHAIN_ID, CONTRACT_ADDRESS } from "../../../../lib/config";
import { syncCertificateIndex } from "../../../../lib/chain";
import { db } from "../../../../lib/db";
import { api, noStoreJson } from "../../../../lib/http";
import { requireAdmin } from "../../../../lib/session";

export const runtime = "nodejs";

export const GET = api(async request => {
  await requireAdmin();
  const progress = await syncCertificateIndex();
  const search = (new URL(request.url).searchParams.get("search") || "").trim().slice(0, 80);
  const rows = await db()`
    SELECT c.cert_id, c.owner_address, c.subject_name, c.fingerprint,
      c.issued_at, c.expires_at, a.id AS attachment_id
    FROM certificates_index c
    LEFT JOIN attachments a ON a.chain_id = c.chain_id
      AND a.contract_address = c.contract_address AND a.cert_id = c.cert_id
      AND a.deleted_at IS NULL
    WHERE c.chain_id = ${CHAIN_ID} AND c.contract_address = ${CONTRACT_ADDRESS}
      AND position(lower(${search}) in lower(c.subject_name)) > 0
    ORDER BY c.cert_id DESC LIMIT 100
  `;
  return noStoreJson({ certificates: rows, progress });
});
