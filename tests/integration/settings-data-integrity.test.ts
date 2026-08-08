import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, fetchAsUser, patchAsUser, execSql } from "./helpers";

const serviceClient = getServiceClient();

// Clinic C holds a single owner so the enforce_plan_limits BEFORE INSERT
// trigger (fires before RLS WITH CHECK) never preempts the unique-index 409
// the race test must observe.
const clinicCId = "c5555555-5555-5555-5555-555555555553";
const ownerC = "clerk_settings_owner_c";

beforeAll(async () => {
  await serviceClient.from("clinics").delete().eq("id", clinicCId);
  await serviceClient.from("clinics").upsert([
    { id: clinicCId, name: "Settings Integrity Clinic C", trial_plan: "practice" },
  ]);
  await serviceClient.from("users").upsert([
    { clinic_id: clinicCId, email: "owner-c@integrity.test", auth_user_id: ownerC, role: "owner" },
  ]);
});

afterAll(async () => {
  await serviceClient.from("clinics").delete().eq("id", clinicCId);
});

describe("Settings data integrity — migration 056 (plan §4.2)", () => {
  it("056: alert_recipients unique index is case-insensitive (clinic_id, lower(email))", () => {
    const index = execSql(
      `SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='alert_recipients' AND indexname='idx_alert_recipients_clinic_email_ci'`,
    );
    expect(parseInt(index, 10)).toBe(1);
    const oldIndex = execSql(
      `SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='alert_recipients' AND indexname='idx_alert_recipients_clinic_email'`,
    );
    expect(parseInt(oldIndex, 10)).toBe(0);
  });

  it("056: pending-invite partial unique index exists", () => {
    const index = execSql(
      `SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='users' AND indexname='idx_users_pending_invite_clinic_email'`,
    );
    expect(parseInt(index, 10)).toBe(1);
  });

  it("recipient uniqueness: Owner@x.com then owner@x.com collapses to one row (case-insensitive)", async () => {
    const first = await fetchAsUser(ownerC, "alert_recipients", {
      method: "POST",
      body: { clinic_id: clinicCId, email: "Owner@x.com" },
    });
    expect(first.status).toBe(201);

    const second = await fetchAsUser(ownerC, "alert_recipients", {
      method: "POST",
      body: { clinic_id: clinicCId, email: "owner@x.com" },
    });
    expect(second.status).toBe(409);

    const { data: rows } = await serviceClient
      .from("alert_recipients")
      .select("email")
      .eq("clinic_id", clinicCId);
    expect(rows).toHaveLength(1);
    expect(rows![0].email.toLowerCase()).toBe("owner@x.com");
  });

  it("invite concurrency (race proof): two simultaneous invites for one email yield exactly one pending row", async () => {
    const email = "race@integrity.test";

    const [a, b] = await Promise.all([
      fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email, role: "viewer" } }),
      fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email, role: "viewer" } }),
    ]);

    const statuses = [a.status, b.status].sort();
    // One insert commits; the loser hits the partial unique index (23505 →
    // PostgREST 409). Exactly one pending row survives.
    expect(statuses).toEqual([201, 409]);

    const { count } = await serviceClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicCId)
      .eq("email", email)
      .is("auth_user_id", null)
      .is("deleted_at", null);
    expect(count).toBe(1);

    // Restore seat headroom (plan-limit trigger caps pending rows per clinic)
    // so later tests in this file keep observing RLS/index behavior, not ND0MV.
    await serviceClient
      .from("users")
      .update({ deleted_at: new Date().toISOString() })
      .eq("clinic_id", clinicCId)
      .eq("email", email)
      .is("auth_user_id", null);
  });

  it("invite dedupe: sequential double-call yields one row, second rejected", async () => {
    const email = "sequential@integrity.test";
    const first = await fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email, role: "viewer" } });
    expect(first.status).toBe(201);
    const second = await fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email, role: "viewer" } });
    expect(second.status).toBe(409);

    // Restore seat headroom for the re-invite test below.
    await serviceClient
      .from("users")
      .update({ deleted_at: new Date().toISOString() })
      .eq("clinic_id", clinicCId)
      .eq("email", email)
      .is("auth_user_id", null);
  });

  it("re-invite after soft-remove: DB blocks a second row (users_email_unique global — migration 008); the partial index excludes deleted rows, so the ACTION revives the soft-deleted row instead", async () => {
    const email = "reinvite@integrity.test";
    const first = await fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email, role: "viewer" } });
    expect(first.status).toBe(201);

    const { data: pending } = await serviceClient
      .from("users")
      .select("id")
      .eq("clinic_id", clinicCId)
      .eq("email", email)
      .is("auth_user_id", null)
      .single();

    const remove = await patchAsUser(ownerC, "users", `id=eq.${pending.id}`, {
      deleted_at: new Date().toISOString(),
    });
    expect(remove.status).toBe(200);
    expect(await remove.json()).toHaveLength(1);

    // The soft-deleted row keeps its email (users_email_unique is global and
    // case-sensitive, migration 008) — a raw second insert is rejected, which
    // is exactly why inviteUser revives the row (deleted_at → null) on 23505
    // instead of creating a duplicate.
    const again = await fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email, role: "viewer" } });
    expect(again.status).toBe(409);

    // The 056 partial index predicate excludes deleted rows by definition —
    // verified via its definition, so the revive path never collides with it.
    const indexDef = execSql(
      `SELECT pg_get_indexdef(indexrelid) FROM pg_index WHERE indexrelid = 'idx_users_pending_invite_clinic_email'::regclass`,
    );
    expect(indexDef).toContain("deleted_at IS NULL");
  });

  it("056: service_role gains the alert_recipients grants the edge function needs (036/038 lesson)", () => {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const granted = execSql(`SELECT has_table_privilege('service_role', 'alert_recipients', '${priv}')`);
      expect(granted).toBe("t");
    }
  });

  it("055: role_templates_manage / role_template_items_manage policies carry the owner/manager role gate", () => {
    const templates = execSql(
      `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='role_templates' AND policyname='role_templates_manage' AND (qual LIKE '%owner%' OR with_check LIKE '%owner%')`,
    );
    expect(parseInt(templates, 10)).toBe(1);
    const items = execSql(
      `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='role_template_items' AND policyname='role_template_items_manage' AND (qual LIKE '%owner%' OR with_check LIKE '%owner%')`,
    );
    expect(parseInt(items, 10)).toBe(1);
  });

  it("055: anon write grants revoked on role template tables", () => {
    for (const table of ["role_templates", "role_template_items"]) {
      for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
        const granted = execSql(`SELECT has_table_privilege('anon', '${table}', '${priv}')`);
        expect(granted).toBe("f");
      }
    }
  });
});
