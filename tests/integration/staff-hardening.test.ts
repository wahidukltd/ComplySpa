import { describe, it, expect, afterAll } from "vitest";
import "./helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAsUser, patchAsUser, deleteAsUser } from "./helpers";

describe("staff hardening — RLS + constraint invariants (integration)", () => {
  const adminClient = createAdminClient();
  const createdClinicIds: string[] = [];
  const createdAuthIds: string[] = [];

  afterAll(async () => {
    await adminClient.from("users").delete().in("auth_user_id", createdAuthIds);
    for (const id of createdClinicIds) {
      await adminClient.from("clinics").delete().eq("id", id);
    }
  });

  async function setupClinic() {
    // Unique per call — auth_user_id is UNIQUE, so module-level constants
    // would collide on the second test's insert.
    const ownerAuthId = `h_owner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const viewerAuthId = `h_viewer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdAuthIds.push(ownerAuthId, viewerAuthId);

    const { data: clinic } = await adminClient
      .from("clinics")
      .insert({ name: `Hardening ${Date.now()}` })
      .select("id")
      .single();
    if (!clinic) throw new Error("Failed to create test clinic");
    createdClinicIds.push(clinic.id);

    const { error: userErr } = await adminClient.from("users").insert([
      { clinic_id: clinic.id, email: `${ownerAuthId}@test.com`, role: "owner", auth_user_id: ownerAuthId },
      { clinic_id: clinic.id, email: `${viewerAuthId}@test.com`, role: "viewer", auth_user_id: viewerAuthId },
    ]);
    expect(userErr).toBeNull();

    const { data: staff } = await adminClient
      .from("staff_members")
      .insert({ clinic_id: clinic.id, name: "Hardening RN", role: "RN" })
      .select("id")
      .single();
    const { data: typeRow } = await adminClient
      .from("credential_types")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!staff || !typeRow) throw new Error("Setup failed");
    return { clinicId: clinic.id, staffId: staff.id, typeId: typeRow.id, ownerAuthId, viewerAuthId };
  }

  it("owner can INSERT onboarding_items via PostgREST (044 role-gate)", async () => {
    const { clinicId, staffId, typeId, ownerAuthId } = await setupClinic();
    const res = await fetchAsUser(ownerAuthId, "onboarding_items", {
      method: "POST",
      body: { staff_member_id: staffId, clinic_id: clinicId, credential_type_id: typeId, is_required: true },
    });
    expect(res.status).toBe(201);
  });

  it("viewer INSERT and DELETE of onboarding_items are rejected by RLS", async () => {
    const { clinicId, staffId, typeId, viewerAuthId } = await setupClinic();

    // Owner creates the item first (admin-backed assert below).
    const { data: item } = await adminClient
      .from("onboarding_items")
      .insert({ staff_member_id: staffId, clinic_id: clinicId, credential_type_id: typeId, is_required: true })
      .select("id")
      .single();
    expect(item).not.toBeNull();

    // Viewer INSERT with a FRESH type id: a 409 (unique violation) would only
    // be reachable if the insert passed RLS (the 044 WITH CHECK gate returns
    // 403 first; the constraint is checked after). A broken policy must fail
    // loudly here, not pass via a colliding type. (Review 2026-08-03.)
    const { data: otherType } = await adminClient
      .from("credential_types")
      .select("id")
      .neq("id", typeId)
      .limit(1)
      .maybeSingle();
    expect(otherType).not.toBeNull();

    const insertRes = await fetchAsUser(viewerAuthId, "onboarding_items", {
      method: "POST",
      body: { staff_member_id: staffId, clinic_id: clinicId, credential_type_id: otherType!.id, is_required: true },
    });
    expect(insertRes.status).toBe(403);

    // Viewer DELETE: zero-row delete (RLS hides the row) — it must survive.
    const deleteRes = await deleteAsUser(viewerAuthId, "onboarding_items", `id=eq.${item!.id}`);
    expect([200, 204, 403]).toContain(deleteRes.status);

    const { data: after } = await adminClient
      .from("onboarding_items")
      .select("id")
      .eq("id", item!.id)
      .maybeSingle();
    expect(after).not.toBeNull();
  });

  it("UNIQUE (staff_member_id, credential_type_id) rejects duplicates — the constraint the idempotent upsert guards against", async () => {
    const { clinicId, staffId, typeId, ownerAuthId } = await setupClinic();

    const first = await fetchAsUser(ownerAuthId, "onboarding_items", {
      method: "POST",
      body: { staff_member_id: staffId, clinic_id: clinicId, credential_type_id: typeId, is_required: true },
    });
    expect(first.status).toBe(201);

    const second = await fetchAsUser(ownerAuthId, "onboarding_items", {
      method: "POST",
      body: { staff_member_id: staffId, clinic_id: clinicId, credential_type_id: typeId, is_required: true },
    });
    expect(second.status).toBe(409);

    const { count } = await adminClient
      .from("onboarding_items")
      .select("id", { count: "exact", head: true })
      .eq("staff_member_id", staffId);
    expect(count).toBe(1);
  });

  it("viewer cannot soft-delete or mutate credentials via PostgREST (credentials UPDATE policy is owner/manager)", async () => {
    const { clinicId, staffId, typeId, viewerAuthId } = await setupClinic();

    const { data: cred } = await adminClient
      .from("credentials")
      .insert({
        staff_member_id: staffId,
        credential_type_id: typeId,
        clinic_id: clinicId,
        license_number: "HARD-001",
        expiration_date: "2027-01-01",
      })
      .select("id")
      .single();
    expect(cred).not.toBeNull();

    const res = await patchAsUser(viewerAuthId, "credentials", `id=eq.${cred!.id}`, {
      license_number: "HARD-999",
    });
    expect([200, 204, 403]).toContain(res.status);

    const { data: after } = await adminClient
      .from("credentials")
      .select("license_number")
      .eq("id", cred!.id)
      .single();
    expect(after!.license_number).toBe("HARD-001");
  });

  it("delete_credential_with_checklist_revert (migration 048): owner delete + revert is atomic and race-free by construction", async () => {
    const { clinicId, staffId, typeId, ownerAuthId } = await setupClinic();

    const { data: item } = await adminClient
      .from("onboarding_items")
      .insert({ staff_member_id: staffId, clinic_id: clinicId, credential_type_id: typeId, is_required: true, status: "completed", completed_at: "2026-01-01T00:00:00Z" })
      .select("id")
      .single();
    expect(item).not.toBeNull();

    const { data: cred } = await adminClient
      .from("credentials")
      .insert({ staff_member_id: staffId, credential_type_id: typeId, clinic_id: clinicId, license_number: "HARD-RPC-1" })
      .select("id")
      .single();
    expect(cred).not.toBeNull();

    // Owner executes the RPC via PostgREST (authenticated role, SECURITY
    // INVOKER — RLS applies): the credential is soft-deleted and the item
    // reverted to pending in one transaction.
    const rpcRes = await fetchAsUser(ownerAuthId, "rpc/delete_credential_with_checklist_revert", {
      method: "POST",
      body: {
        p_credential_id: cred!.id,
        p_staff_member_id: staffId,
        p_clinic_id: clinicId,
      },
    });
    if (rpcRes.status !== 200) console.log("RPC DEBUG:", rpcRes.status, await rpcRes.text());
    expect(rpcRes.status).toBe(200);
    const rpcBody = (await rpcRes.json()) as { deleted?: boolean; reverted?: boolean };
    expect(rpcBody.deleted).toBe(true);
    expect(rpcBody.reverted).toBe(true);

    const { data: credAfter } = await adminClient
      .from("credentials")
      .select("deleted_at")
      .eq("id", cred!.id)
      .single();
    expect(credAfter!.deleted_at).not.toBeNull();

    const { data: itemAfter } = await adminClient
      .from("onboarding_items")
      .select("status, completed_at, completed_by_user_id")
      .eq("id", item!.id)
      .single();
    expect(itemAfter).toMatchObject({ status: "pending", completed_at: null, completed_by_user_id: null });
  });

  it("soft_delete_staff_member (migration 048): owner works, viewer is denied, cross-clinic is rejected", async () => {
    const { clinicId, staffId, ownerAuthId, viewerAuthId } = await setupClinic();
    const { clinicId: otherClinicId } = await setupClinic();

    // Owner deletes own-clinic staff via the RPC.
    const ownerRes = await fetchAsUser(ownerAuthId, "rpc/soft_delete_staff_member", {
      method: "POST",
      body: { p_staff_id: staffId, p_clinic_id: clinicId },
    });
    expect(ownerRes.status).toBe(200);
    expect((await ownerRes.json()) as boolean).toBe(true);

    const { data: after } = await adminClient
      .from("staff_members")
      .select("deleted_at")
      .eq("id", staffId)
      .single();
    expect(after!.deleted_at).not.toBeNull();

    // Viewer on a FRESH staff member: the DEFINER function is role-gated
    // inside its body — must report false and delete nothing.
    const { data: viewerStaff } = await adminClient
      .from("staff_members")
      .insert({ clinic_id: clinicId, name: "Viewer Target" })
      .select("id")
      .single();
    expect(viewerStaff).not.toBeNull();
    const viewerRes = await fetchAsUser(viewerAuthId, "rpc/soft_delete_staff_member", {
      method: "POST",
      body: { p_staff_id: viewerStaff!.id, p_clinic_id: clinicId },
    });
    expect(viewerRes.status).toBe(200);
    expect((await viewerRes.json()) as boolean).toBe(false);

    const { data: viewerAfter } = await adminClient
      .from("staff_members")
      .select("deleted_at")
      .eq("id", viewerStaff!.id)
      .single();
    expect(viewerAfter!.deleted_at).toBeNull();

    // Repeat delete of an already-deleted row: idempotent and honest.
    const repeatRes = await fetchAsUser(ownerAuthId, "rpc/soft_delete_staff_member", {
      method: "POST",
      body: { p_staff_id: staffId, p_clinic_id: clinicId },
    });
    expect(repeatRes.status).toBe(200);
    expect((await repeatRes.json()) as boolean).toBe(false);

    // Cross-clinic id: the clinic pin must reject it.
    const { data: otherStaff } = await adminClient
      .from("staff_members")
      .insert({ clinic_id: otherClinicId, name: "Other Clinic Staff" })
      .select("id")
      .single();
    expect(otherStaff).not.toBeNull();
    const crossRes = await fetchAsUser(ownerAuthId, "rpc/soft_delete_staff_member", {
      method: "POST",
      body: { p_staff_id: otherStaff!.id, p_clinic_id: clinicId },
    });
    expect(crossRes.status).toBe(200);
    expect((await crossRes.json()) as boolean).toBe(false);

    const { data: otherAfter } = await adminClient
      .from("staff_members")
      .select("deleted_at")
      .eq("id", otherStaff!.id)
      .single();
    expect(otherAfter!.deleted_at).toBeNull();
  });

  it("delete_credential_with_checklist_revert: viewer and multi-state semantics hold under RLS", async () => {
    const { clinicId, staffId, typeId, ownerAuthId, viewerAuthId } = await setupClinic();

    // Multi-state: two live credentials of the same type — delete one, the
    // item must NOT revert.
    const { data: credA } = await adminClient
      .from("credentials")
      .insert({ staff_member_id: staffId, credential_type_id: typeId, clinic_id: clinicId, license_number: "HARD-A", state: "TX" })
      .select("id")
      .single();
    const { data: credB } = await adminClient
      .from("credentials")
      .insert({ staff_member_id: staffId, credential_type_id: typeId, clinic_id: clinicId, license_number: "HARD-B", state: "CA" })
      .select("id")
      .single();
    const { data: item } = await adminClient
      .from("onboarding_items")
      .insert({ staff_member_id: staffId, clinic_id: clinicId, credential_type_id: typeId, is_required: true, status: "completed" })
      .select("id")
      .single();
    expect(credA && credB && item).toBeTruthy();

    const ownerRes = await fetchAsUser(ownerAuthId, "rpc/delete_credential_with_checklist_revert", {
      method: "POST",
      body: { p_credential_id: credA!.id, p_staff_member_id: staffId, p_clinic_id: clinicId },
    });
    expect(ownerRes.status).toBe(200);
    const ownerBody = (await ownerRes.json()) as { deleted?: boolean; reverted?: boolean };
    expect(ownerBody).toMatchObject({ deleted: true, reverted: false });

    const { data: itemAfter } = await adminClient
      .from("onboarding_items")
      .select("status")
      .eq("id", item!.id)
      .single();
    expect(itemAfter!.status).toBe("completed");

    // Viewer: the DEFINER function is role-gated inside its body — a viewer's
    // direct RPC call must report deleted:false and delete nothing.
    const viewerRes = await fetchAsUser(viewerAuthId, "rpc/delete_credential_with_checklist_revert", {
      method: "POST",
      body: { p_credential_id: credB!.id, p_staff_member_id: staffId, p_clinic_id: clinicId },
    });
    expect(viewerRes.status).toBe(200);
    const viewerBody = (await viewerRes.json()) as { deleted?: boolean };
    expect(viewerBody.deleted).toBe(false);

    const { data: credBAfter } = await adminClient
      .from("credentials")
      .select("deleted_at")
      .eq("id", credB!.id)
      .single();
    expect(credBAfter!.deleted_at).toBeNull();
  });
});
