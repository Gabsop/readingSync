import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

const envPath = resolve(import.meta.dirname, "..", ".env");
const envFile = readFileSync(envPath, "utf-8");

let dbUrl;
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (trimmed.startsWith("#") || !trimmed) continue;
  const match = trimmed.match(/^DATABASE_URL\s*=\s*"?([^"]+)"?$/);
  if (match) {
    dbUrl = match[1];
    break;
  }
}

if (!dbUrl) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

console.log("Connecting to:", dbUrl.replace(/\/\/[^@]*@/, "//<redacted>@"));
const sql = postgres(dbUrl);

await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
console.log("Database wiped clean — public schema recreated empty");
await sql.end();
