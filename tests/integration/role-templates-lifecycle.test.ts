import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, fetchAsUser, rpcAsUser, execSql } from "./helpers";

// Custom-role lifecycle suite (migration 057). Clinic A is the actor clinic
// (owner only, practice plan — the plan-limit trigger never interferes);
// Clinic B holds a custom credential type used for the cross-tenant item test.
const clinicAId = "a7777777-7777-7777-7777-777777777771";
const clinicBId = "b8888888-8888-8888-8888-888888888882";
const ownerA = "clerk_rt_lifecycle_owner_a";
const ownerB = "clerk_rt_lifecycle_owner_b";

const serviceClient = getServiceClient();

let globalCprId: string;
let globalRnId: string;
let clinicBTypeId: string;
let customTemplateId: string;
let overrideTemplateId: string;
let staffAId: string;

/** PostgREST error body shape from an RPC call. */
async function rpcError(res: Response): Promise<{ code: string; message: string }> {
  expect(res.status).toBe(400);
  return res.json();
}

beforeAll(async () => {
  await serviceClient.from("clinics").delete().in("id", [clinicAId, clinicBId]);

  await serviceClient.from("clinics").upsert([
    { id: clinicAId, name: "Role Template Lifecycle A", trial_plan: "practice" },
    { id: clinicBId, name: "Role Template Lifecycle B", trial_plan: "practice" },
  ]);
  await serviceClient.from("users").upsert([
    { clinic_id: clinicAId, email: "rt-a@lifecycle.test", auth_user_id: ownerA, role: "owner" },
    { clinic_id: clinicBId, email: "rt-b@lifecycle.test", auth_user_id: ownerB, role: "owner" },
  ]);

  const { data: cpr } = await serviceClient
    .from("credential_types")
    .select("id")
    .eq("name", "CPR/BLS Certification")
    .is("clinic_id", null)
    .single();
  globalCprId = cpr!.id;

  const { data: rn } = await serviceClient
    .from("credential_types")
    .select("id")
    .eq("name", "Registered Nurse License")
    .is("clinic_id", null)
    .single();
  globalRnId = rn!.id;

  // A custom credential type owned by clinic B — the cross-tenant item test
  // must never be able to attach it to clinic A's templates.
  const { data: bType } = await serviceClient
    .from("credential_types")
    .insert({ clinic_id: clinicBId, name: "Clinic B Only License", category: "license", is_custom: true })
    .select("id")
    .single();
  clinicBTypeId = bType!.id;
});

afterAll(async () => {
  await serviceClient.from("clinics").delete().in("id", [clinicAId, clinicBId]);
});

describe("create_role_template — atomic create with guards", () => {
  it("creates a custom template + items in one call and maintains updated_at", async () => {
    const res = await rpcAsUser(ownerA, "create_role_template", {
      p_role: "Laser Technician",
      p_items: [{ credential_type_id: globalCprId, is_required: true }],
    });
    expect(res.status).toBe(200);
    customTemplateId = (await res.json()) as string;
    expect(customTemplateId).toMatch(/^[0-9a-f-]{36}$/);

    const { data: template } = await serviceClient
      .from("role_templates")
      .select("id, clinic_id, role, created_at, updated_at")
      .eq("id", customTemplateId)
      .single();
    expect(template!.clinic_id).toBe(clinicAId);
    expect(template!.role).toBe("Laser Technician");
    // updated_at is set at insert (the replace test below proves the bump is
    // a real write with a strict `>` across transactions).

    const { data: items } = await serviceClient
      .from("role_template_items")
      .select("credential_type_id, is_required, sort_order")
      .eq("template_id", customTemplateId);
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({ credential_type_id: globalCprId, is_required: true, sort_order: 0 });
  });

  it("rejects a case-insensitive duplicate within the same clinic", async () => {
    const res = await rpcAsUser(ownerA, "create_role_template", {
      p_role: "laser technician",
      p_items: [],
    });
    const err = await rpcError(res);
    expect(err.code).toBe("P0001");
    expect(err.message).toContain("already exists");
  });

  it("allows same-name-as-global (the explicit override flow)", async () => {
    const res = await rpcAsUser(ownerA, "create_role_template", {
      p_role: "RN",
      p_items: [{ credential_type_id: globalRnId, is_required: true }],
    });
    expect(res.status).toBe(200);
    overrideTemplateId = (await res.json()) as string;

    const { data: template } = await serviceClient
      .from("role_templates")
      .select("clinic_id, role")
      .eq("id", overrideTemplateId)
      .single();
    expect(template!.clinic_id).toBe(clinicAId);
    expect(template!.role).toBe("RN");
  });

  it("rejects items referencing another clinic's credential type", async () => {
    const res = await rpcAsUser(ownerA, "create_role_template", {
      p_role: "Cross Tenant Role",
      p_items: [{ credential_type_id: clinicBTypeId, is_required: true }],
    });
    const err = await rpcError(res);
    expect(err.code).toBe("P0001");
    expect(err.message).toContain("not available to this clinic");
  });

  it("rejects more than 50 items and malformed role names", async () => {
    const manyItems = Array.from({ length: 51 }, (_, i) => ({
      credential_type_id: globalCprId,
      is_required: i % 2 === 0,
    }));
    const tooMany = await rpcAsUser(ownerA, "create_role_template", { p_role: "Too Many", p_items: manyItems });
    expect((await tooMany.json()).code).toBe("P0001");

    // Pattern violations surface as the CHECK constraint (23514) — the RPC
    // pre-checks length only; the DB CHECK is the authoritative pattern source
    // and the app's zod schema catches the pattern before this boundary.
    const badName = await rpcAsUser(ownerA, "create_role_template", { p_role: "Bad@Role!", p_items: [] });
    expect((await badName.json()).code).toBe("23514");
  });

  it("rejects duplicate credential_type_ids in one item array (P0001, not a misleading 23505)", async () => {
    const res = await rpcAsUser(ownerA, "create_role_template", {
      p_role: "Dup Items Role",
      p_items: [
        { credential_type_id: globalCprId, is_required: true },
        { credential_type_id: globalCprId, is_required: false },
      ],
    });
    const err = await rpcError(res);
    expect(err.code).toBe("P0001");
    expect(err.message).toContain("Duplicate template items");
  });

  it("allows the same role name in a DIFFERENT clinic (B1 regression: per-clinic namespace)", async () => {
    const res = await rpcAsUser(ownerB, "create_role_template", {
      p_role: "Laser Technician",
      p_items: [{ credential_type_id: globalCprId, is_required: true }],
    });
    expect(res.status).toBe(200);

    // ...but a case-variant WITHIN clinic B still collides (same-clinic CI
    // dedupe is per-clinic and still enforced).
    const caseVariant = await rpcAsUser(ownerB, "create_role_template", {
      p_role: "laser technician",
      p_items: [],
    });
    const err = await rpcError(caseVariant);
    expect(err.code).toBe("P0001");
    expect(err.message).toContain("already exists");
  });
});

describe("replace_role_template_items — atomic replace", () => {
  it("replaces items atomically and bumps updated_at", async () => {
    const before = await serviceClient
      .from("role_templates")
      .select("updated_at")
      .eq("id", customTemplateId)
      .single();

    const res = await rpcAsUser(ownerA, "replace_role_template_items", {
      p_template_id: customTemplateId,
      p_items: [
        { credential_type_id: globalCprId, is_required: true },
        { credential_type_id: globalRnId, is_required: false },
      ],
    });
    // RETURNS void RPCs answer 204 No Content.
    expect(res.status).toBe(204);

    const { data: items } = await serviceClient
      .from("role_template_items")
      .select("credential_type_id, is_required, sort_order")
      .eq("template_id", customTemplateId)
      .order("sort_order");
    expect(items).toHaveLength(2);
    expect(items![0]).toMatchObject({ credential_type_id: globalCprId, is_required: true, sort_order: 0 });
    expect(items![1]).toMatchObject({ credential_type_id: globalRnId, is_required: false, sort_order: 1 });

    const after = await serviceClient
      .from("role_templates")
      .select("updated_at")
      .eq("id", customTemplateId)
      .single();
    expect(new Date(after.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(before.data!.updated_at).getTime(),
    );
  });

  it("rejects cross-clinic template access (clinic pin)", async () => {
    const res = await rpcAsUser(ownerB, "replace_role_template_items", {
      p_template_id: customTemplateId,
      p_items: [],
    });
    const err = await rpcError(res);
    expect(err.message).toContain("Template not found");
  });
});

describe("staff role <-> template guard (057 trigger)", () => {
  it("allows staff with a custom role; rejects a template-less role with P0001", async () => {
    const ok = await fetchAsUser(ownerA, "staff_members", {
      method: "POST",
      body: {
        clinic_id: clinicAId,
        name: "Laser Tech One",
        role: "Laser Technician",
        hire_date: null,
        email: null,
        phone: null,
      },
    });
    expect(ok.status).toBe(201);
    const created = await ok.json();
    staffAId = created[0].id;

    const rejected = await fetchAsUser(ownerA, "staff_members", {
      method: "POST",
      body: {
        clinic_id: clinicAId,
        name: "Ghost Role Person",
        role: "Ghost Role",
        hire_date: null,
        email: null,
        phone: null,
      },
    });
    expect(rejected.status).toBe(400);
    const err = await rejected.json();
    expect(err.code).toBe("P0001");
    expect(err.message).toContain("has no active template");
  });
});

describe("rename_role_template — atomic rename across template + staff", () => {
  it("moves the template AND staff rows in one transaction and preserves onboarding items", async () => {
    // Onboarding items are keyed by (staff, credential_type) — never role —
    // so a rename must leave them byte-identical.
    const { data: item } = await serviceClient
      .from("onboarding_items")
      .insert({
        staff_member_id: staffAId,
        clinic_id: clinicAId,
        credential_type_id: globalCprId,
        is_required: true,
        status: "pending",
      })
      .select("id, status, completed_at, completed_by_user_id")
      .single();

    const res = await rpcAsUser(ownerA, "rename_role_template", {
      p_template_id: customTemplateId,
      p_new_role: "Senior Laser Tech",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(1); // staff moved

    const { data: template } = await serviceClient
      .from("role_templates")
      .select("role")
      .eq("id", customTemplateId)
      .single();
    expect(template!.role).toBe("Senior Laser Tech");

    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("role")
      .eq("id", staffAId)
      .single();
    expect(staff!.role).toBe("Senior Laser Tech");

    const { data: itemAfter } = await serviceClient
      .from("onboarding_items")
      .select("id, status, completed_at, completed_by_user_id")
      .eq("id", item!.id)
      .single();
    expect(itemAfter).toEqual(item);
  });

  it("closes the race: the OLD role name no longer resolves after the rename", async () => {
    const rejected = await fetchAsUser(ownerA, "staff_members", {
      method: "POST",
      body: { clinic_id: clinicAId, name: "Late Writer", role: "Laser Technician", hire_date: null, email: null, phone: null },
    });
    expect(rejected.status).toBe(400);

    const ok = await fetchAsUser(ownerA, "staff_members", {
      method: "POST",
      body: { clinic_id: clinicAId, name: "New Role Holder", role: "Senior Laser Tech", hire_date: null, email: null, phone: null },
    });
    expect(ok.status).toBe(201);
    const created = await ok.json();
    await serviceClient.from("staff_members").delete().eq("id", created[0].id);
  });

  it("protects global templates (clinic pin) and rejects collisions with full rollback", async () => {
    const { data: globalTemplate } = await serviceClient
      .from("role_templates")
      .select("id")
      .is("clinic_id", null)
      .eq("role", "MA")
      .single();

    const globalAttempt = await rpcAsUser(ownerA, "rename_role_template", {
      p_template_id: globalTemplate!.id,
      p_new_role: "Medical Assistant Pro",
    });
    expect((await globalAttempt.json()).message).toContain("Template not found");

    // Collision with a global role name — the rename must not silently
    // re-resolve staff to the global template.
    const staffBefore = await serviceClient
      .from("staff_members")
      .select("role")
      .eq("id", staffAId)
      .single();
    const templateBefore = await serviceClient
      .from("role_templates")
      .select("role")
      .eq("id", customTemplateId)
      .single();

    const collision = await rpcAsUser(ownerA, "rename_role_template", {
      p_template_id: customTemplateId,
      p_new_role: "RN",
    });
    const err = await rpcError(collision);
    expect(err.message).toContain("already exists");

    // Full rollback: no partial move on failure.
    const staffAfter = await serviceClient
      .from("staff_members")
      .select("role")
      .eq("id", staffAId)
      .single();
    const templateAfter = await serviceClient
      .from("role_templates")
      .select("role")
      .eq("id", customTemplateId)
      .single();
    expect(staffAfter.data!.role).toBe(staffBefore.data!.role);
    expect(templateAfter.data!.role).toBe(templateBefore.data!.role);
  });
});

describe("delete_role_template — in-use guard + reset semantics", () => {
  it("blocks deleting a custom role held by staff", async () => {
    const res = await rpcAsUser(ownerA, "delete_role_template", {
      p_template_id: customTemplateId,
    });
    const err = await rpcError(res);
    expect(err.code).toBe("P0001");
    expect(err.message).toContain("assigned to 1 staff");
  });

  it("deletes the custom role once staff are reassigned", async () => {
    // Reassign the staff member to the RN override (which resolves) so the
    // in-use guard releases; the RN override itself is deleted below (reset).
    await serviceClient.from("staff_members").update({ role: "RN" }).eq("id", staffAId);

    const res = await rpcAsUser(ownerA, "delete_role_template", {
      p_template_id: customTemplateId,
    });
    // RETURNS void RPCs answer 204 No Content.
    expect(res.status).toBe(204);

    const { data: gone } = await serviceClient
      .from("role_templates")
      .select("id")
      .eq("id", customTemplateId)
      .maybeSingle();
    expect(gone).toBeNull();
  });

  it("deletes an override while staff still hold the role (deterministic reset to global)", async () => {
    const res = await rpcAsUser(ownerA, "delete_role_template", {
      p_template_id: overrideTemplateId,
    });
    expect(res.status).toBe(204);

    // Staff still resolve: the global RN template exists (fallback verified).
    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("role")
      .eq("id", staffAId)
      .single();
    expect(staff!.role).toBe("RN");

    const { data: globalRn } = await serviceClient
      .from("role_templates")
      .select("id")
      .is("clinic_id", null)
      .eq("role", "RN")
      .maybeSingle();
    expect(globalRn).not.toBeNull();
  });
});

describe("057 DB constraints (format CHECK + CI indexes)", () => {
  it("role_templates.role enforces the format CHECK", () => {
    expect(() =>
      execSql(
        `INSERT INTO role_templates (clinic_id, role) VALUES (NULL, 'Bad@Role!!')`,
      ),
    ).toThrow(/role_templates_role_check/);
    expect(() =>
      execSql(`INSERT INTO role_templates (clinic_id, role) VALUES (NULL, '${"A".repeat(81)}')`),
    ).toThrow(/role_templates_role_check/);
    // A valid international role inserts (and is cleaned up — a global row
    // would otherwise collide with the next run's identical name).
    const role = `Injectioniste${Date.now()}`;
    expect(() =>
      execSql(
        `INSERT INTO role_templates (clinic_id, role) VALUES (NULL, '${role}'); DELETE FROM role_templates WHERE role = '${role}';`,
      ),
    ).not.toThrow();
  });

  it("staff_members.role enforces the format CHECK (trigger disabled so the CHECK is reachable)", () => {
    // The role-template trigger fires BEFORE the CHECK and preempts it for any
    // pattern-violating role (which by construction has no template) — disable
    // it around the insert so the constraint itself is exercised.
    execSql("ALTER TABLE staff_members DISABLE TRIGGER trigger_staff_members_role_template");
    try {
      expect(() =>
        execSql(
          `INSERT INTO staff_members (id, clinic_id, name, role) VALUES ('11111111-1111-1111-1111-111111111111', '${clinicAId}', 'Fmt', 'Bad@Role!')`,
        ),
      ).toThrow(/staff_members_role_check/);
      expect(() =>
        execSql(
          `INSERT INTO staff_members (id, clinic_id, name, role) VALUES ('11111111-1111-1111-1111-111111111112', '${clinicAId}', 'Fmt', '${"A".repeat(81)}')`,
        ),
      ).toThrow(/staff_members_role_check/);
    } finally {
      execSql("ALTER TABLE staff_members ENABLE TRIGGER trigger_staff_members_role_template");
    }
  });

  it("case-insensitive duplicate indexes reject case variants in both scopes", async () => {
    // Clinic scope: create an override, then a case-variant twin must collide.
    const { data: override } = await serviceClient
      .from("role_templates")
      .insert({ clinic_id: clinicAId, role: "RN", is_active: true })
      .select("id")
      .single();
    const clinicDup = await serviceClient
      .from("role_templates")
      .insert({ clinic_id: clinicAId, role: "rn" });
    expect(clinicDup.error).not.toBeNull();
    expect(clinicDup.error!.code).toBe("23505");
    await serviceClient.from("role_templates").delete().eq("id", override!.id);

    // Global scope: the seeded global "RN" exists, so a case-variant twin
    // must collide.
    const globalDup = await serviceClient
      .from("role_templates")
      .insert({ clinic_id: null, role: "rn" });
    expect(globalDup.error).not.toBeNull();
    expect(globalDup.error!.code).toBe("23505");
  });
});
