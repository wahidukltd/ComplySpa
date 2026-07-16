import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, fetchAsUser, patchAsUser } from "./helpers";

const serviceClient = getServiceClient();

const clinicAId = "a1111111-1111-1111-1111-111111111111";
const clinicBId = "b2222222-2222-2222-2222-222222222222";
const clerkUserA = "clerk_rls_test_a";
const clerkUserB = "clerk_rls_test_b";
const clerkViewerA = "clerk_rls_test_viewer_a";
const clerkManagerA = "clerk_rls_test_manager_a";

beforeAll(async () => {
  await serviceClient.from("clinics").delete().in("id", [clinicAId, clinicBId]);

  const { error: clinicError } = await serviceClient.from("clinics").upsert([
    { id: clinicAId, name: "RLS Test Clinic A" },
    { id: clinicBId, name: "RLS Test Clinic B" },
  ]);
  if (clinicError) throw new Error(`Failed to insert clinics: ${clinicError.message}`);

  const { error: userError } = await serviceClient.from("users").upsert([
    { clinic_id: clinicAId, email: "a@rls-test.com", clerk_user_id: clerkUserA, role: "owner" },
    { clinic_id: clinicBId, email: "b@rls-test.com", clerk_user_id: clerkUserB, role: "owner" },
    { clinic_id: clinicAId, email: "viewer@rls-test.com", clerk_user_id: clerkViewerA, role: "viewer" },
    { clinic_id: clinicAId, email: "manager@rls-test.com", clerk_user_id: clerkManagerA, role: "manager" },
  ]);
  if (userError) throw new Error(`Failed to insert users: ${userError.message}`);

  const { error: staffError } = await serviceClient.from("staff_members").upsert([
    { clinic_id: clinicAId, name: "Alice A", role: "RN" },
    { clinic_id: clinicBId, name: "Bob B", role: "NP" },
  ]);
  if (staffError) throw new Error(`Failed to insert staff: ${staffError.message}`);
});

afterAll(async () => {
  await serviceClient.from("clinics").delete().in("id", [clinicAId, clinicBId]);
});

describe("RLS clinic isolation", () => {
  it("Clinic A user sees only Clinic A staff", async () => {
    const res = await fetchAsUser(clerkUserA, "staff_members");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Alice A");
  });

  it("Clinic B user sees only Clinic B staff", async () => {
    const res = await fetchAsUser(clerkUserB, "staff_members");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Bob B");
  });

  it("Clinic A user cannot insert staff into Clinic B", async () => {
    const res = await fetchAsUser(clerkUserA, "staff_members", {
      method: "POST",
      body: { clinic_id: clinicBId, name: "Infiltrator", role: "RN" },
    });
    expect(res.status).toBe(403);
  });

  it("Clinic A user sees only Clinic A in clinics table", async () => {
    const res = await fetchAsUser(clerkUserA, "clinics");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("RLS Test Clinic A");
  });

  it("both clinics see global credential types", async () => {
    const [resA, resB] = await Promise.all([
      fetchAsUser(clerkUserA, "credential_types"),
      fetchAsUser(clerkUserB, "credential_types"),
    ]);
    const dataA = await resA.json();
    const dataB = await resB.json();
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(dataA.length).toBeGreaterThanOrEqual(12);
    expect(dataB.length).toBeGreaterThanOrEqual(12);
  });

  it("no JWT returns zero rows", async () => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/staff_members`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(0);
  });
});

describe("Role enforcement (C3 fix)", () => {
  it("viewer cannot INSERT staff members", async () => {
    const res = await fetchAsUser(clerkViewerA, "staff_members", {
      method: "POST",
      body: { clinic_id: clinicAId, name: "Viewer Staff", role: "RN" },
    });
    expect(res.status).toBe(403);
  });

  it("manager can INSERT staff members", async () => {
    const res = await fetchAsUser(clerkManagerA, "staff_members", {
      method: "POST",
      body: { clinic_id: clinicAId, name: "Manager Staff", role: "RN" },
    });
    expect(res.status).toBe(201);
    await serviceClient.from("staff_members").delete().eq("name", "Manager Staff");
  });

  it("viewer cannot INSERT audit reports", async () => {
    const res = await fetchAsUser(clerkViewerA, "audit_reports", {
      method: "POST",
      body: { clinic_id: clinicAId },
    });
    expect(res.status).toBe(403);
  });

  it("viewer cannot INSERT users", async () => {
    const res = await fetchAsUser(clerkViewerA, "users", {
      method: "POST",
      body: { clinic_id: clinicAId, email: "new@rls-test.com", clerk_user_id: "clerk_new", role: "viewer" },
    });
    expect(res.status).toBe(403);
  });

  it("manager cannot INSERT users (owner only)", async () => {
    const res = await fetchAsUser(clerkManagerA, "users", {
      method: "POST",
      body: { clinic_id: clinicAId, email: "new@rls-test.com", clerk_user_id: "clerk_new2", role: "viewer" },
    });
    expect(res.status).toBe(403);
  });
});

describe("WITH CHECK enforcement (C1 fix)", () => {
  it("cannot UPDATE staff member's clinic_id to another clinic", async () => {
    const res = await patchAsUser(
      clerkUserA,
      "staff_members",
      `clinic_id=eq.${clinicAId}`,
      { clinic_id: clinicBId },
    );
    // 400 = immutability trigger raises exception (defense in depth, fires before RLS WITH CHECK)
    // 403 = RLS WITH CHECK blocked the update
    // Both mean the attack was blocked.
    expect([400, 403]).toContain(res.status);
  });

  it("cannot UPDATE credentials clinic_id (if any exist)", async () => {
    // Insert a credential first using service role
    const { data: ct } = await serviceClient
      .from("credential_types")
      .select("id")
      .eq("name", "Registered Nurse License")
      .limit(1);
    if (!ct || ct.length === 0) throw new Error("No credential type found");

    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("id")
      .eq("clinic_id", clinicAId)
      .limit(1);
    if (!staff || staff.length === 0) throw new Error("No staff member found");

    await serviceClient.from("credentials").upsert({
      staff_member_id: staff[0].id,
      credential_type_id: ct[0].id,
      clinic_id: clinicAId,
      license_number: "TEST-LIC-001",
    });

    const res = await patchAsUser(
      clerkUserA,
      "credentials",
      `clinic_id=eq.${clinicAId}`,
      { clinic_id: clinicBId },
    );
    // 400 = immutability trigger raises exception (defense in depth, fires before RLS WITH CHECK)
    // 403 = RLS WITH CHECK blocked the update
    expect([400, 403]).toContain(res.status);

    await serviceClient.from("credentials").delete().eq("license_number", "TEST-LIC-001");
  });
});

describe("Billing bypass prevention (C2 fix)", () => {
  it("authenticated user cannot UPDATE clinics", async () => {
    const res = await patchAsUser(
      clerkUserA,
      "clinics",
      `id=eq.${clinicAId}`,
      { name: "Hacked Clinic" },
    );
    expect(res.status).toBe(403);
  });
});

describe("Soft-delete hiding (N3 fix)", () => {
  it("staff_members with deleted_at set are hidden from SELECT", async () => {
    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("id")
      .eq("clinic_id", clinicAId)
      .limit(1);
    if (!staff || staff.length === 0) throw new Error("No staff found");

    await serviceClient
      .from("staff_members")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", staff[0].id);

    const res = await fetchAsUser(clerkUserA, "staff_members");
    const data = await res.json();
    expect(res.status).toBe(200);
    // Only non-deleted staff are visible
    expect(data.every((s: { deleted_at: string | null }) => s.deleted_at === null)).toBe(true);

    // Restore for other tests
    await serviceClient
      .from("staff_members")
      .update({ deleted_at: null })
      .eq("id", staff[0].id);
  });
});

describe("Credentials isolation", () => {
  it("each clinic sees only its own credentials", async () => {
    const { data: ct } = await serviceClient
      .from("credential_types")
      .select("id")
      .eq("name", "Registered Nurse License")
      .limit(1);
    if (!ct || ct.length === 0) throw new Error("No credential type found");

    const { data: staffA } = await serviceClient
      .from("staff_members")
      .select("id")
      .eq("clinic_id", clinicAId)
      .limit(1);
    const { data: staffB } = await serviceClient
      .from("staff_members")
      .select("id")
      .eq("clinic_id", clinicBId)
      .limit(1);
    if (!staffA || !staffB) throw new Error("No staff found");

    await serviceClient.from("credentials").upsert([
      { staff_member_id: staffA[0].id, credential_type_id: ct[0].id, clinic_id: clinicAId, license_number: "RLS-CRED-A" },
      { staff_member_id: staffB[0].id, credential_type_id: ct[0].id, clinic_id: clinicBId, license_number: "RLS-CRED-B" },
    ]);

    const [resA, resB] = await Promise.all([
      fetchAsUser(clerkUserA, "credentials"),
      fetchAsUser(clerkUserB, "credentials"),
    ]);
    const dataA = await resA.json();
    const dataB = await resB.json();

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(dataA.every((c: { clinic_id: string }) => c.clinic_id === clinicAId)).toBe(true);
    expect(dataB.every((c: { clinic_id: string }) => c.clinic_id === clinicBId)).toBe(true);
    expect(dataA.some((c: { license_number: string }) => c.license_number === "RLS-CRED-A")).toBe(true);
    expect(dataA.some((c: { license_number: string }) => c.license_number === "RLS-CRED-B")).toBe(false);

    await serviceClient.from("credentials").delete().in("license_number", ["RLS-CRED-A", "RLS-CRED-B"]);
  });
});

describe("credential_types isolation (M-5 coverage)", () => {
  it("each clinic can see global credential types", async () => {
    const [resA, resB] = await Promise.all([
      fetchAsUser(clerkUserA, "credential_types?is_custom=eq.false"),
      fetchAsUser(clerkUserB, "credential_types?is_custom=eq.false"),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const dataA = await resA.json();
    const dataB = await resB.json();
    expect(dataA.length).toBeGreaterThanOrEqual(12);
    expect(dataB.length).toBe(dataA.length);
  });

  it("owner can INSERT a custom credential type", async () => {
    const res = await fetchAsUser(clerkUserA, "credential_types", {
      method: "POST",
      body: { clinic_id: clinicAId, name: "Custom RLS Test Type", is_custom: true, category: "license" },
    });
    expect(res.status).toBe(201);
    await serviceClient.from("credential_types").delete().eq("name", "Custom RLS Test Type");
  });

  it("viewer cannot INSERT a custom credential type", async () => {
    const res = await fetchAsUser(clerkViewerA, "credential_types", {
      method: "POST",
      body: { clinic_id: clinicAId, name: "Viewer Custom Type", is_custom: true, category: "license" },
    });
    expect(res.status).toBe(403);
  });

  it("Clinic A cannot see Clinic B's custom credential types", async () => {
    const { error } = await serviceClient.from("credential_types").insert({
      clinic_id: clinicBId, name: "Clinic B Secret Type", is_custom: true, category: "license",
    });
    if (error) throw new Error(`Failed to insert: ${error.message}`);

    const res = await fetchAsUser(clerkUserA, "credential_types?is_custom=eq.true");
    const data = await res.json();
    const clinicBNames = data.filter((c: { name: string }) => c.name === "Clinic B Secret Type");
    expect(clinicBNames).toHaveLength(0);

    await serviceClient.from("credential_types").delete().eq("name", "Clinic B Secret Type");
  });
});

describe("Owner can manage users", () => {
  it("owner can INSERT a new user", async () => {
    const res = await fetchAsUser(clerkUserA, "users", {
      method: "POST",
      body: {
        clinic_id: clinicAId,
        email: "newowner@rls-test.com",
        clerk_user_id: "clerk_new_owner_test",
        role: "viewer",
      },
    });
    expect(res.status).toBe(201);
    await serviceClient.from("users").delete().eq("clerk_user_id", "clerk_new_owner_test");
  });
});
