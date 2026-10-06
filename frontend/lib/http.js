export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function assertOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Invalid request origin");
  }
}

export async function jsonBody(request, maxLength = 32_768) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > maxLength) throw new HttpError(413, "Request is too large");
  const raw = await request.text();
  if (raw.length > maxLength) throw new HttpError(413, "Request is too large");
  try { return JSON.parse(raw); }
  catch { throw new HttpError(400, "Invalid JSON"); }
}

export function api(handler) {
  return async (request, context) => {
    try { return await handler(request, context); }
    catch (error) {
      if (!(error instanceof HttpError)) console.error("API error:", error);
      return Response.json(
        { error: error instanceof HttpError ? error.message : "Service unavailable" },
        { status: error instanceof HttpError ? error.status : 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  };
}

export function noStoreJson(value, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
