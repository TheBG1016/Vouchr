import { api, assertOrigin, noStoreJson } from "../../../../lib/http";
import { destroySession } from "../../../../lib/session";

export const runtime = "nodejs";

export const POST = api(async request => {
  assertOrigin(request);
  await destroySession();
  return noStoreJson({ ok: true });
});
