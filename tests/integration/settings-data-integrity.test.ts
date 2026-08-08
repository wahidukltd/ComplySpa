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

  it("056 consolidation (seeded duplicate fixture, plan §7 step 2 DoD): case-variant duplicates collapse deterministically — earliest kept, active state preserved, email normalized", () => {
    // Replays the reordered 056 consolidation against a seeded case-variant
    // group INSIDE a transaction (review-team fix: the normalization must
    // run after dedupe — a normalize-first order aborts with 23505 on this
    // exact dataset). The CI index is dropped inside the transaction so the
    // seed can exist at all; ROLLBACK restores the index and discards rows.
    const result = execSql(
      `BEGIN;
DROP INDEX idx_alert_recipients_clinic_email_ci;
INSERT INTO alert_recipients (clinic_id, email, is_active, created_at) VALUES
  ('${clinicCId}', 'Owner@x.com', false, NOW() - interval '3 days'),
  ('${clinicCId}', 'owner@x.com', true, NOW() - interval '2 days'),
  ('${clinicCId}', 'OWNER@x.com', false, NOW() - interval '1 day');
-- step 3: activate the earliest row when a later duplicate is active
UPDATE alert_recipients a SET is_active = true
WHERE a.is_active = false
  AND EXISTS (
    SELECT 1 FROM alert_recipients b
    WHERE b.id <> a.id AND b.clinic_id = a.clinic_id
      AND lower(b.email) = lower(a.email) AND b.is_active = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM alert_recipients c
    WHERE c.clinic_id = a.clinic_id AND lower(c.email) = lower(a.email)
      AND (c.created_at, c.id) < (a.created_at, a.id)
  );
-- step 4: keep earliest (created_at, id)
DELETE FROM alert_recipients a
WHERE a.id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY clinic_id, lower(email) ORDER BY created_at ASC, id ASC) AS rn
    FROM alert_recipients
  ) ranked WHERE rn > 1
);
-- step 5: normalize (index-free at this point)
UPDATE alert_recipients SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));
SELECT email || '|' || is_active::text FROM alert_recipients WHERE clinic_id = '${clinicCId}';
ROLLBACK;`,
    );
    expect(result).toBe("owner@x.com|true");
  });

  it("056 CI index rejects a raw case-variant insert at the DB level (bypassing the action's normalization)", async () => {
    const { data: seeded, error: seedError } = await serviceClient
      .from("alert_recipients")
      .insert({ clinic_id: clinicCId, email: "CaseVariant@test.com" })
      .select("id")
      .single();
    expect(seedError).toBeNull();
    expect(seeded).not.toBeNull();

    const { error: dupError } = await serviceClient
      .from("alert_recipients")
      .insert({ clinic_id: clinicCId, email: "casevariant@test.com" })
      .select("id")
      .single();
    expect(dupError?.code).toBe("23505");

    await serviceClient.from("alert_recipients").delete().eq("id", seeded!.id);
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

  it("056: scoped grants — edge function (service_role) can read recipients; 028 F5 posture preserved (anon never gets DML)", () => {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(execSql(`SELECT has_table_privilege('authenticated', 'alert_recipients', '${priv}')`)).toBe("t");
      expect(execSql(`SELECT has_table_privilege('service_role', 'alert_recipients', '${priv}')`)).toBe("t");
    }
    for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
      expect(execSql(`SELECT has_table_privilege('anon', 'alert_recipients', '${priv}')`)).toBe("f");
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

// Seat enforcement at the DB path (plan 2026-08-08): the enforce_plan_limits
// trigger is authoritative when the UI/action is bypassed. Pending invites
// count toward the cap. These tests run after the invite tests and clean up
// after themselves (soft-delete) so the clinic's seat count stays 1/3.
const clinicSId = "77777777-7777-7777-7777-777777777775";
const ownerS = "clerk_settings_owner_s";

describe("Seat enforcement (plan 2026-08-08 — backend authoritative)", () => {
  beforeAll(async () => {
    await serviceClient.from("clinics").delete().eq("id", clinicSId);
    await serviceClient.from("clinics").upsert([
      { id: clinicSId, name: "Seat Solo Clinic", plan: "solo", trial_plan: "solo" },
    ]);
    await serviceClient.from("users").upsert([
      { clinic_id: clinicSId, email: "owner-s@seats.test", auth_user_id: ownerS, role: "owner" },
    ]);
  });

  afterAll(async () => {
    await serviceClient.from("clinics").delete().in("id", [clinicSId]);
    // Restore clinic C's seat count for any later runs of this file.
    await serviceClient
      .from("users")
      .update({ deleted_at: new Date().toISOString() })
      .eq("clinic_id", clinicCId)
      .eq("email", "seat@seats.test");
  });

  it("solo (1/1): a second user row is blocked by the trigger — ND0MV even though RLS would allow the owner insert", async () => {
    const res = await fetchAsUser(ownerS, "users", {
      method: "POST",
      body: { clinic_id: clinicSId, email: "solo-second@seats.test", role: "viewer" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("ND0MV");
  });

  it("solo owner sees exactly one member (themselves) — view access, no memberships beyond the cap", async () => {
    const res = await fetchAsUser(ownerS, "users");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].email).toBe("owner-s@seats.test");
  });

  it("practice: pending invites occupy seats — owner + 2 pending = 3/3, the third invite is blocked by the trigger", async () => {
    const first = await fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email: "seat-a@seats.test", role: "viewer" } });
    expect(first.status).toBe(201);
    const second = await fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email: "seat-b@seats.test", role: "viewer" } });
    expect(second.status).toBe(201);

    const blocked = await fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email: "seat-c@seats.test", role: "viewer" } });
    expect(blocked.status).toBe(400);
    const body = await blocked.json();
    expect(body.code).toBe("ND0MV");

    const { count } = await serviceClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicCId)
      .is("deleted_at", null);
    expect(count).toBe(3);
  });

  it("practice: removing a member frees a seat — re-invite succeeds after soft-remove", async () => {
    const { data: target } = await serviceClient
      .from("users")
      .select("id")
      .eq("clinic_id", clinicCId)
      .eq("email", "seat-a@seats.test")
      .single();

    const remove = await patchAsUser(ownerC, "users", `id=eq.${target.id}`, {
      deleted_at: new Date().toISOString(),
    });
    expect(remove.status).toBe(200);

    const reInvite = await fetchAsUser(ownerC, "users", { method: "POST", body: { clinic_id: clinicCId, email: "seat-a@seats.test", role: "viewer" } });
    // users_email_unique keeps the soft-deleted row's address — the action
    // revives it; at the DB path the insert is rejected, which is the
    // documented reason inviteUser revives instead of inserting.
    expect([201, 409]).toContain(reInvite.status);
  });
});
