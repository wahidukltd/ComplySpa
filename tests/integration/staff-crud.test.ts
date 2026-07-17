import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "./helpers";
import { createAdminClient } from "@/lib/supabase/admin";

describe("staff CRUD", () => {
  const admin = createAdminClient();
  const testUserId: string = `test_user_${Date.now()}`;

  async function setup() {
    const { data: clinic } = await admin
      .from("clinics")
      .insert({ name: `Test Clinic ${Date.now()}` })
      .select("id")
      .single();
    if (!clinic) throw new Error("Failed to create test clinic");

    const { error: userErr } = await admin
      .from("users")
      .insert({
        clinic_id: clinic.id,
        email: `${testUserId}@test.com`,
        role: "owner",
        clerk_user_id: testUserId,
      });
    expect(userErr).toBeNull();

    return clinic.id;
  }

  async function teardown(clinicId: string) {
    await admin.from("credentials").delete().eq("clinic_id", clinicId);
    await admin.from("staff_members").delete().eq("clinic_id", clinicId);
    await admin.from("users").delete().eq("clerk_user_id", testUserId);
    await admin.from("clinics").delete().eq("id", clinicId);
  }

  let clinicId: string;

  beforeAll(async () => {
    clinicId = await setup();
  }, 30000);

  afterAll(async () => {
    await teardown(clinicId);
  }, 30000);

  it("creates a staff member", async () => {
    const { data: staff, error } = await admin
      .from("staff_members")
      .insert({
        clinic_id: clinicId,
        name: "Jane Smith",
        role: "RN",
        email: "jane@test.com",
        hire_date: "2025-01-15",
      })
      .select("id, name, role")
      .single();

    expect(error).toBeNull();
    expect(staff).not.toBeNull();
    expect(staff!.name).toBe("Jane Smith");
    expect(staff!.role).toBe("RN");
  });

  it("reads staff with soft-delete filter", async () => {
    const { data: staff, error } = await admin
      .from("staff_members")
      .select("id, name, role, deleted_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null);

    expect(error).toBeNull();
    expect(staff!.length).toBeGreaterThan(0);
    staff!.forEach((s) => expect(s.deleted_at).toBeNull());
  });

  it("soft-deletes a staff member", async () => {
    const { data: staff } = await admin
      .from("staff_members")
      .insert({
        clinic_id: clinicId,
        name: "Delete Me",
      })
      .select("id")
      .single();

    const { error } = await admin
      .from("staff_members")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", staff!.id);

    expect(error).toBeNull();

    const { data: active } = await admin
      .from("staff_members")
      .select("id")
      .eq("id", staff!.id)
      .is("deleted_at", null);

    expect(active!.length).toBe(0);
  });

  it("creates a credential linked to a staff member", async () => {
    const { data: staff } = await admin
      .from("staff_members")
      .select("id")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .limit(1)
      .single();

    const { data: types } = await admin
      .from("credential_types")
      .select("id")
      .limit(1)
      .single();

    const { data: cred, error } = await admin
      .from("credentials")
      .insert({
        staff_member_id: staff!.id,
        credential_type_id: types!.id,
        clinic_id: clinicId,
        license_number: "RN123456",
        state: "TX",
        expiration_date: "2027-06-01",
      })
      .select("id, license_number, state")
      .single();

    expect(error).toBeNull();
    expect(cred).not.toBeNull();
    expect(cred!.license_number).toBe("RN123456");
    expect(cred!.state).toBe("TX");
  });

  it("supports multi-state credential tracking", async () => {
    const { data: staff } = await admin
      .from("staff_members")
      .insert({
        clinic_id: clinicId,
        name: "Multi-State Test Staff",
      })
      .select("id")
      .single();

    const { data: types } = await admin
      .from("credential_types")
      .select("id")
      .limit(1)
      .single();
    const typeId = types!.id;

    await admin.from("credentials").insert({
      staff_member_id: staff!.id,
      credential_type_id: typeId,
      clinic_id: clinicId,
      license_number: "MULTI-TX-001",
      state: "TX",
      expiration_date: "2027-01-01",
    });

    await admin.from("credentials").insert({
      staff_member_id: staff!.id,
      credential_type_id: typeId,
      clinic_id: clinicId,
      license_number: "MULTI-CA-002",
      state: "CA",
      expiration_date: "2027-06-01",
    });

    const { data: creds } = await admin
      .from("credentials")
      .select("id, state")
      .eq("staff_member_id", staff!.id)
      .eq("credential_type_id", typeId);

    expect(creds!.length).toBe(2);
    const states = creds!.map((c) => c.state).sort();
    expect(states).toEqual(["CA", "TX"]);
  });
});
