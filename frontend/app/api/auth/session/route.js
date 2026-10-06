import { api, noStoreJson } from "../../../../lib/http";
import { getSession } from "../../../../lib/session";

export const runtime = "nodejs";

export const GET = api(async () => {
  const session = await getSession();
  if (!session) return noStoreJson({ session: null });
  return noStoreJson({ session: {
    address: session.address,
    role: session.role,
    displayName: session.displayName,
    encryptionPublicKey: session.encryptionPublicKey,
    encryptedPrivateKey: session.encryptedPrivateKey,
  } });
});
