import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load .env.local — fail with a clear message if missing
let envContent: string;
try {
  envContent = readFileSync(".env.local", "utf8");
} catch {
  throw new Error(
    "Missing .env.local — copy .env.local.example to .env.local and fill in values before running integration tests.",
  );
}
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Derive DB container name from supabase/config.toml project_id
let configContent: string;
try {
  configContent = readFileSync("supabase/config.toml", "utf8");
} catch {
  throw new Error("supabase/config.toml not found — run from repo root.");
}
const projectIdMatch = configContent.match(/^project_id\s*=\s*"([^"]+)"/m);
if (!projectIdMatch) {
  throw new Error("Could not find project_id in supabase/config.toml");
}
const DB_CONTAINER = `supabase_db_${projectIdMatch[1]}`;

// JWT secret for local Supabase — read once from the running container
let JWT_SECRET: string;
try {
  JWT_SECRET = execSync(`docker exec ${DB_CONTAINER} printenv JWT_SECRET`, {
    encoding: "utf8",
  }).trim();
} catch {
  throw new Error(
    `Could not read JWT_SECRET from ${DB_CONTAINER}. Is 'supabase start' running?`,
  );
}

/** Run SQL directly via psql (for pg_catalog / cron.job queries not exposed via PostgREST) */
export function execSql(sql: string): string {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -t -A`, {
    input: sql,
    encoding: "utf8",
  }).trim();
}

/** Craft a JWT signed with the local Supabase JWT secret */
function createJwt(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(
    JSON.stringify({
      ...payload,
      iss: "supabase-demo",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

// PostgREST requires JWT-format keys, not the new sb_publishable_/sb_secret_ format.
// Craft JWT-format keys from the JWT secret for local dev test compatibility.
const anonKeyJwt = createJwt({ role: "anon" });
const serviceKeyJwt = createJwt({ role: "service_role" });

/** Fetch a PostgREST resource as a specific Clerk user (RLS-enforced) */
export async function fetchAsUser(
  clerkUserId: string,
  table: string,
  options: { method?: string; body?: object } = {},
): Promise<Response> {
  const jwt = createJwt({ sub: clerkUserId, role: "authenticated" });
  return fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anonKeyJwt,
      "Content-Type": "application/json",
      ...(options.method === "POST" ? { Prefer: "return=representation" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

/** PATCH a PostgREST resource as a specific Clerk user with a filter */
export async function patchAsUser(
  clerkUserId: string,
  table: string,
  filter: string,
  body: object,
): Promise<Response> {
  const jwt = createJwt({ sub: clerkUserId, role: "authenticated" });
  return fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anonKeyJwt,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
}

/** Service role client (bypasses RLS) — for test setup/teardown only */
export function getServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, serviceKeyJwt);
}
