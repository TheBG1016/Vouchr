import { neon } from "@neondatabase/serverless";

let client;

export function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  client ||= neon(process.env.DATABASE_URL);
  return client;
}

export async function limitRequest(key, maxPerHour) {
  const bucket = Math.floor(Date.now() / 3_600_000);
  const rows = await db()`
    INSERT INTO request_limits (key, bucket, count) VALUES (${key}, ${bucket}, 1)
    ON CONFLICT (key, bucket)
    DO UPDATE SET count = request_limits.count + 1
    RETURNING count
  `;
  return rows[0].count <= maxPerHour;
}
