import { existsSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

// This file contains trusted, project-owned SQL. Split only top-level statements;
// the PL/pgSQL function has its own dollar-quoted body.
const statements = [];
let current = "";
let inFunction = false;
for (const line of schema.split(/\r?\n/)) {
  if (line.includes("AS $$")) inFunction = true;
  if (line.trim() === "$$;") inFunction = false;
  current += line + "\n";
  if (!inFunction && line.trim().endsWith(";")) {
    statements.push(current.trim());
    current = "";
  }
}
for (const statement of statements) await sql.query(statement);
console.log(`Applied ${statements.length} schema statements`);
