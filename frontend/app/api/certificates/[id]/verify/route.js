import { verifyOnChain } from "../../../../../lib/chain";
import { api, noStoreJson } from "../../../../../lib/http";
import { requireId } from "../../../../../lib/validation";

export const runtime = "nodejs";

export const GET = api(async (_request, { params }) => {
  const id = requireId((await params).id);
  return noStoreJson(await verifyOnChain(id));
});
