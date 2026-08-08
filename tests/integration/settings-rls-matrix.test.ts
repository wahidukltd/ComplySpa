import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, fetchAsUser, patchAsUser, execSql } from "./helpers";

const serviceClient = getServiceClient();

// Fixtures keep each clinic under the practice 3-user plan limit so the
// enforce_plan_limits BEFORE INSERT trigger (which fires before the RLS
// WITH CHECK) does not mask the RLS results with ND0MV 400s. Clinic A holds
// owner + manager (headroom for one pending insert); viewer lives in Clinic B.
const clinicAId = "a3333333-3333-3333-3333-333333333331";
const clinicBId = "b4444444-4444-4444-4444-444444444442";
const ownerA = "clerk_settings_owner_a";
const ownerB = "clerk_settings_owner_b";
const managerA = "clerk_settings_manager_a";
const viewerA = "clerk_settings_viewer_a";

let clinicATemplateId: string;
let globalCredentialTypeId: string;

beforeAll(async () => {
  await serviceClient.from("clinics").delete().in("id", [clinicAId, clinicBId]);

  await serviceClient.from("clinics").upsert([
    { id: clinicAId, name: "Settings Matrix Clinic A", trial_plan: "practice" },
    { id: clinicBId, name: "Settings Matrix Clinic B", trial_plan: "practice" },
  ]);
  await serviceClient.from("users").upsert([
    { clinic_id: clinicAId, email: "owner-a@matrix.test", auth_user_id: ownerA, role: "owner" },
    { clinic_id: clinicAId, email: "manager-a@matrix.test", auth_user_id: managerA, role: "manager" },
    { clinic_id: clinicBId, email: "owner-b@matrix.test", auth_user_id: ownerB, role: "owner" },
    { clinic_id: clinicBId, email: "viewer-a@matrix.test", auth_user_id: viewerA, role: "viewer" },
  ]);

  // Clinic-scoped role template for the role_templates / items tests.
  const { data: template } = await serviceClient
    .from("role_templates")
    .insert({ clinic_id: clinicAId, role: "MA", is_active: true })
    .select("id")
    .single();
  clinicATemplateId = template.id;

  const { data: type } = await serviceClient
    .from("credential_types")
    .select("id")
    .eq("name", "CPR/BLS Certification")
    .is("clinic_id", null)
    .single();
  globalCredentialTypeId = type.id;
});

afterAll(async () => {
  await serviceClient.from("clinics").delete().in("id", [clinicAId, clinicBId]);
});

describe("Settings RLS authorization matrix (plan §4.1 — DB must equal app)", () => {
  it("055: clinics UPDATE grant restored for authenticated", () => {
    const granted = execSql("SELECT has_table_privilege('authenticated', 'clinics', 'UPDATE')");
    expect(granted).toBe("t");
  });

  it("055: clinics_update_owner policy exists and is owner-gated with WITH CHECK", () => {
    const policy = execSql(
      `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='clinics' AND policyname='clinics_update_owner' AND cmd='UPDATE' AND with_check LIKE '%owner%'`,
    );
    expect(parseInt(policy, 10)).toBe(1);
  });

  it("clinics UPDATE: owner allowed (055 restores the previously-broken profile save)", async () => {
    const res = await patchAsUser(ownerA, "clinics", `id=eq.${clinicAId}`, { name: "Settings Matrix Clinic A v2" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    await serviceClient.from("clinics").update({ name: "Settings Matrix Clinic A" }).eq("id", clinicAId);
  });

  it("clinics UPDATE: manager denied (PostgREST: 200 with zero affected rows)", async () => {
    const res = await patchAsUser(managerA, "clinics", `id=eq.${clinicAId}`, { name: "Hacked" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("clinics UPDATE: viewer denied", async () => {
    const res = await patchAsUser(viewerA, "clinics", `id=eq.${clinicAId}`, { name: "Hacked" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // users INSERT — denial tests run before the owner-allowed insert so the
  // plan-limit trigger (2/3 users) never preempts the RLS result.

  it("users INSERT: manager denied (006 gate re-asserted)", async () => {
    const res = await fetchAsUser(managerA, "users", {
      method: "POST",
      body: { clinic_id: clinicAId, email: "pending-manager@matrix.test", role: "viewer" },
    });
    expect(res.status).toBe(403);
  });

  it("users INSERT: viewer denied — planted pending invite (role='owner') blocked", async () => {
    const res = await fetchAsUser(viewerA, "users", {
      method: "POST",
      body: { clinic_id: clinicBId, email: "planted@matrix.test", role: "owner" },
    });
    expect(res.status).toBe(403);
  });

  it("users INSERT: cross-clinic owner denied", async () => {
    const res = await fetchAsUser(ownerB, "users", {
      method: "POST",
      body: { clinic_id: clinicAId, email: "cross@matrix.test", role: "viewer" },
    });
    expect(res.status).toBe(403);
  });

  it("users INSERT: owner allowed (pending invite)", async () => {
    const res = await fetchAsUser(ownerA, "users", {
      method: "POST",
      body: { clinic_id: clinicAId, email: "pending-owner@matrix.test", role: "manager" },
    });
    expect(res.status).toBe(201);
  });

  it("users UPDATE: owner can change another user's role (sole-actor model)", async () => {
    const { data: target } = await serviceClient
      .from("users")
      .select("id")
      .eq("clinic_id", clinicAId)
      .eq("email", "manager-a@matrix.test")
      .single();
    const res = await patchAsUser(ownerA, "users", `id=eq.${target.id}`, { role: "viewer" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    const restore = await patchAsUser(ownerA, "users", `id=eq.${target.id}`, { role: "manager" });
    expect(restore.status).toBe(200);
  });

  it("users UPDATE: owner self-row UPDATE allowed at the DB (boundary note — action blocks role self-change)", async () => {
    const { data: self } = await serviceClient
      .from("users")
      .select("id")
      .eq("clinic_id", clinicAId)
      .eq("auth_user_id", ownerA)
      .single();
    const res = await patchAsUser(ownerA, "users", `id=eq.${self.id}`, { email: "owner-a@matrix.test" });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it("users UPDATE: manager self-role-change denied (055 USING gate)", async () => {
    const { data: self } = await serviceClient
      .from("users")
      .select("id")
      .eq("clinic_id", clinicAId)
      .eq("auth_user_id", managerA)
      .single();
    const res = await patchAsUser(managerA, "users", `id=eq.${self.id}`, { role: "owner" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("users UPDATE: viewer self-role escalation denied (055 USING gate + 006 WITH CHECK)", async () => {
    const { data: self } = await serviceClient
      .from("users")
      .select("id")
      .eq("clinic_id", clinicBId)
      .eq("auth_user_id", viewerA)
      .single();
    const res = await patchAsUser(viewerA, "users", `id=eq.${self.id}`, { role: "owner" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("users UPDATE: viewer cannot touch rows in another clinic", async () => {
    const { data: target } = await serviceClient
      .from("users")
      .select("id")
      .eq("clinic_id", clinicAId)
      .eq("email", "manager-a@matrix.test")
      .single();
    const res = await patchAsUser(viewerA, "users", `id=eq.${target.id}`, { role: "viewer" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("users UPDATE: cross-clinic owner denied", async () => {
    const { data: target } = await serviceClient
      .from("users")
      .select("id")
      .eq("clinic_id", clinicAId)
      .eq("email", "manager-a@matrix.test")
      .single();
    const res = await patchAsUser(ownerB, "users", `id=eq.${target.id}`, { role: "viewer" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("credential_types INSERT: manager allowed, viewer denied (006 re-asserted)", async () => {
    const asManager = await fetchAsUser(managerA, "credential_types", {
      method: "POST",
      body: { name: "Matrix Custom Type", category: "training", is_custom: true, clinic_id: clinicAId },
    });
    expect(asManager.status).toBe(201);
    const asViewer = await fetchAsUser(viewerA, "credential_types", {
      method: "POST",
      body: { name: "Matrix Viewer Type", category: "training", is_custom: true, clinic_id: clinicBId },
    });
    expect(asViewer.status).toBe(403);
    await serviceClient.from("credential_types").delete().eq("name", "Matrix Custom Type").eq("clinic_id", clinicAId);
  });

  it("role_templates INSERT: manager allowed (055 gate)", async () => {
    const res = await fetchAsUser(managerA, "role_templates", {
      method: "POST",
      body: { clinic_id: clinicAId, role: "front_desk", is_active: true },
    });
    expect(res.status).toBe(201);
  });

  it("role_templates INSERT: viewer denied (055 closes the 041 gap)", async () => {
    const res = await fetchAsUser(viewerA, "role_templates", {
      method: "POST",
      body: { clinic_id: clinicBId, role: "NP", is_active: true },
    });
    expect(res.status).toBe(403);
  });

  it("role_templates INSERT: cross-clinic denied", async () => {
    const res = await fetchAsUser(ownerB, "role_templates", {
      method: "POST",
      body: { clinic_id: clinicAId, role: "PA", is_active: true },
    });
    expect(res.status).toBe(403);
  });

  it("role_template_items INSERT: manager allowed into own clinic template", async () => {
    const res = await fetchAsUser(managerA, "role_template_items", {
      method: "POST",
      body: { template_id: clinicATemplateId, credential_type_id: globalCredentialTypeId, is_required: true, sort_order: 0 },
    });
    expect(res.status).toBe(201);
  });

  it("role_template_items INSERT: viewer denied (055 closes the 041 gap)", async () => {
    const res = await fetchAsUser(viewerA, "role_template_items", {
      method: "POST",
      body: { template_id: clinicATemplateId, credential_type_id: globalCredentialTypeId, is_required: true, sort_order: 1 },
    });
    expect(res.status).toBe(403);
  });

  it("role_template_items INSERT: cross-clinic owner denied", async () => {
    const res = await fetchAsUser(ownerB, "role_template_items", {
      method: "POST",
      body: { template_id: clinicATemplateId, credential_type_id: globalCredentialTypeId, is_required: true, sort_order: 2 },
    });
    expect(res.status).toBe(403);
  });

  it("alert_recipients: manager allowed, viewer denied (018 re-asserted)", async () => {
    const asManager = await fetchAsUser(managerA, "alert_recipients", {
      method: "POST",
      body: { clinic_id: clinicAId, email: "ops@matrix.test" },
    });
    expect(asManager.status).toBe(201);
    const asViewer = await fetchAsUser(viewerA, "alert_recipients", {
      method: "POST",
      body: { clinic_id: clinicBId, email: "viewer-plant@matrix.test" },
    });
    expect(asViewer.status).toBe(403);
  });
});
