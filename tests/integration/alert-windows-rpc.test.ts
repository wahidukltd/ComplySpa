import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, execSql, rpcAsUser } from "./helpers";

// Migration 051: get_alert_windows â€” bounded DISTINCT alert-window lookup.
// SECURITY INVOKER so RLS applies inside; p_clinic_id can never cross tenants.
const serviceClient = getServiceClient();

const clinicAId = "a3333333-1111-1111-1111-111111111111";
const clinicBId = "b4444444-2222-2222-2222-222222222222";
const userA = "clerk_alertwin_a";
const userB = "clerk_alertwin_b";

let credentialAId: string;
let credentialBId: string;

beforeAll(async () => {
  await serviceClient.from("clinics").delete().in("id", [clinicAId, clinicBId]);

  const { error: clinicError } = await serviceClient.from("clinics").upsert([
    { id: clinicAId, name: "Alert Windows A", trial_plan: "practice" },
    { id: clinicBId, name: "Alert Windows B", trial_plan: "practice" },
  ]);
  if (clinicError) throw new Error(`Failed to insert clinics: ${clinicError.message}`);

  const { error: userError } = await serviceClient.from("users").upsert([
    { clinic_id: clinicAId, email: "awin-a@rls-test.com", auth_user_id: userA, role: "owner" },
    { clinic_id: clinicBId, email: "awin-b@rls-test.com", auth_user_id: userB, role: "owner" },
  ]);
  if (userError) throw new Error(`Failed to insert users: ${userError.message}`);

  const { data: typeRow } = await serviceClient
    .from("credential_types")
    .select("id")
    .is("clinic_id", null)
    .limit(1)
    .single();
  if (!typeRow) throw new Error("No global credential type seeded");

  const { data: staffA } = await serviceClient
    .from("staff_members")
    .insert({ clinic_id: clinicAId, name: "Win A", role: "RN" })
    .select()
    .single();
  const { data: staffB } = await serviceClient
    .from("staff_members")
    .insert({ clinic_id: clinicBId, name: "Win B", role: "RN" })
    .select()
    .single();
  if (!staffA || !staffB) throw new Error("Failed to insert staff");

  const { data: credA } = await serviceClient
    .from("credentials")
    .insert({
      clinic_id: clinicAId,
      staff_member_id: staffA.id,
      credential_type_id: typeRow.id,
      status: "valid",
    })
    .select()
    .single();
  const { data: credB } = await serviceClient
    .from("credentials")
    .insert({
      clinic_id: clinicBId,
      staff_member_id: staffB.id,
      credential_type_id: typeRow.id,
      status: "valid",
    })
    .select()
    .single();
  if (!credA || !credB) throw new Error("Failed to insert credentials");
  credentialAId = credA.id;
  credentialBId = credB.id;

  // Duplicate 90-window rows for clinic A (idempotency history) to prove
  // DISTINCT dedupes; a -7 escalation window for the Escalation display.
  const { error: logError } = await serviceClient.from("alert_logs").insert([
    { clinic_id: clinicAId, credential_id: credentialAId, alert_type: "email", days_before_expiration: 90, delivery_status: "delivered", recipient: "a@win-test.com" },
    { clinic_id: clinicAId, credential_id: credentialAId, alert_type: "email", days_before_expiration: 90, delivery_status: "delivered", recipient: "a@win-test.com" },
    { clinic_id: clinicAId, credential_id: credentialAId, alert_type: "email", days_before_expiration: -7, delivery_status: "delivered", recipient: "a@win-test.com" },
    { clinic_id: clinicBId, credential_id: credentialBId, alert_type: "email", days_before_expiration: 60, delivery_status: "delivered", recipient: "b@win-test.com" },
  ]);
  if (logError) throw new Error(`Failed to insert alert_logs: ${logError.message}`);
});

afterAll(async () => {
  await serviceClient.from("alert_logs").delete().eq("clinic_id", clinicAId);
  await serviceClient.from("alert_logs").delete().eq("clinic_id", clinicBId);
  await serviceClient.from("clinics").delete().in("id", [clinicAId, clinicBId]);
});

describe("get_alert_windows (migration 051)", () => {
  it("returns distinct alert windows for the caller's own clinic", async () => {
    const res = await rpcAsUser(userA, "get_alert_windows", { p_clinic_id: clinicAId });
    expect(res.status).toBe(200);
    const rows = await res.json();
    // 3 inserted rows dedupe to 2 distinct windows.
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { days_before_expiration: number }) => r.days_before_expiration).sort()).toEqual([-7, 90]);
    expect(rows.every((r: { credential_id: string }) => r.credential_id === credentialAId)).toBe(true);
  });

  it("cannot read another clinic's windows even with a forged p_clinic_id", async () => {
    const res = await rpcAsUser(userA, "get_alert_windows", { p_clinic_id: clinicBId });
    expect(res.status).toBe(200);
    const rows = await res.json();
    // RLS (invoker) filters the forged clinic id down to the caller's own rows: none.
    expect(rows).toEqual([]);
  });

  it("is executable by authenticated but not anon or service_role", () => {
    const fn = "get_alert_windows(uuid)";
    const authenticated = execSql(
      `SELECT has_function_privilege('authenticated', '${fn}', 'EXECUTE')`,
    );
    const anon = execSql(`SELECT has_function_privilege('anon', '${fn}', 'EXECUTE')`);
    const service = execSql(`SELECT has_function_privilege('service_role', '${fn}', 'EXECUTE')`);
    expect(authenticated).toBe("t");
    expect(anon).toBe("f");
    expect(service).toBe("f");
  });
});

