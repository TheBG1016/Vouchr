import { randomUUID } from "node:crypto";
import { db } from "../../../../../../lib/db";
import { api, assertOrigin, HttpError, noStoreJson } from "../../../../../../lib/http";
import { requireAdmin } from "../../../../../../lib/session";

export const runtime = "nodejs";

export const POST = api(async (request, { params }) => {
  assertOrigin(request);
  const admin = await requireAdmin();
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Invalid request ID");
  const [result] = await db()`SELECT complete_vouchr_recovery(${id}) AS completed`;
  if (!result.completed) throw new HttpError(409, "Recovery is incomplete or expired");
  await db()`INSERT INTO access_audit (id, actor_address, action)
    VALUES (${randomUUID()}, ${admin.address}, 'recovery_completed')`;
  return noStoreJson({ completed: true });
});
