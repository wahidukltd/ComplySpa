import { describe, it, expect, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import "./helpers";
import { getServiceClient, fetchAsUser } from "./helpers";

describe("onboarding flow", () => {
  const adminClient = createAdminClient();
  const serviceClient = getServiceClient();
  const testUserId = `test_user_${Date.now()}`;
  const testClinicName = `Test Clinic ${Date.now()}`;
  const createdClinicIds: string[] = [];

  afterAll(async () => {
    await adminClient.from("users").delete().eq("clerk_user_id", testUserId);
    for (const id of createdClinicIds) {
      await adminClient.from("clinics").delete().eq("id", id);
    }
  });

  function trackClinic(id: string) {
    createdClinicIds.push(id);
  }

  it("rejects clinic INSERT via RLS-enforced client without a users row", async () => {
    const res = await fetchAsUser("never_onboarded", "clinics", {
      method: "POST",
      body: { name: "Should Fail" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects users INSERT via RLS-enforced client (chicken-and-egg guard)", async () => {
    const res = await fetchAsUser("never_onboarded_2", "users", {
      method: "POST",
      body: {
        clinic_id: "00000000-0000-0000-0000-000000000000",
        email: "new@test.com",
        role: "owner",
        clerk_user_id: "never_onboarded_2",
      },
    });
    expect(res.status).toBe(403);
  });

  it("creates a clinic and user record via the admin client", async () => {
    const { data: clinic, error: clinicError } = await adminClient
      .from("clinics")
      .insert({ name: testClinicName })
      .select("id")
      .single();

    expect(clinicError).toBeNull();
    expect(clinic).not.toBeNull();
    expect(clinic!.id).toBeDefined();
    trackClinic(clinic!.id);

    const { error: userError } = await adminClient.from("users").insert({
      clinic_id: clinic!.id,
      email: `${testUserId}@test.com`,
      role: "owner",
      clerk_user_id: testUserId,
    });

    expect(userError).toBeNull();

    const { data: userRecord } = await adminClient
      .from("users")
      .select("clinic_id, role")
      .eq("clerk_user_id", testUserId)
      .single();

    expect(userRecord).not.toBeNull();
    expect(userRecord!.clinic_id).toBe(clinic!.id);
    expect(userRecord!.role).toBe("owner");
  });

  it("clerk_user_id UNIQUE rejects duplicate insert", async () => {
    const { data: clinic } = await adminClient
      .from("clinics")
      .insert({ name: `Duplicate Test ${Date.now()}` })
      .select("id")
      .single();
    trackClinic(clinic!.id);

    const { error: firstInsert } = await serviceClient.from("users").insert({
      clinic_id: clinic!.id,
      email: "dup@test.com",
      role: "owner",
      clerk_user_id: "dup_clerk_test",
    });
    expect(firstInsert).toBeNull();

    const { error: secondInsert } = await serviceClient.from("users").insert({
      clinic_id: clinic!.id,
      email: "dup2@test.com",
      role: "owner",
      clerk_user_id: "dup_clerk_test",
    });
    expect(secondInsert).not.toBeNull();
    expect(secondInsert!.code).toBe("23505");

    await serviceClient.from("users").delete().eq("clerk_user_id", "dup_clerk_test");
    await adminClient.from("clinics").delete().eq("id", clinic!.id);
  });

  it("sets clinic plan to trial with 14-day expiry on creation", async () => {
    const { data: clinic } = await adminClient
      .from("clinics")
      .insert({ name: `Trial Test ${Date.now()}` })
      .select("plan, trial_end_date")
      .single();
    trackClinic(clinic!.id);

    expect(clinic!.plan).toBe("trial");
    expect(new Date(clinic!.trial_end_date).getTime()).toBeGreaterThan(Date.now());

    await adminClient.from("clinics").delete().eq("id", clinic!.id);
  });

  it("create_clinic_for_user RPC creates clinic + user atomically and is idempotent", async () => {
    const rpcUserId = `rpc_test_${Date.now()}`;
    const rpcEmail = `${rpcUserId}@test.com`;

    const { data: clinicId, error: firstErr } = await adminClient.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "create_clinic_for_user" as any,
      {
        p_clerk_sub: rpcUserId,
        p_email: rpcEmail,
        p_name: "RPC Test Clinic",
      }
    );
    expect(firstErr).toBeNull();
    expect(clinicId).not.toBeNull();

    const { data: userRecord } = await adminClient
      .from("users")
      .select("clinic_id, role, email")
      .eq("clerk_user_id", rpcUserId)
      .single();
    expect(userRecord).not.toBeNull();
    expect(userRecord!.clinic_id).toBe(clinicId);
    expect(userRecord!.role).toBe("owner");
    expect(userRecord!.email).toBe(rpcEmail);

    // Second call with same clerk_user_id returns existing clinic_id (idempotent)
    const { data: existingClinicId, error: secondErr } = await adminClient.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "create_clinic_for_user" as any,
      {
        p_clerk_sub: rpcUserId,
        p_email: rpcEmail,
        p_name: "RPC Test Clinic Duplicate",
      }
    );
    expect(secondErr).toBeNull();
    expect(existingClinicId).toBe(clinicId);

    // Only one clinic exists for this user
    const { count: userCount } = await adminClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("clerk_user_id", rpcUserId);
    expect(userCount).toBe(1);

    // Cleanup
    await adminClient.from("users").delete().eq("clerk_user_id", rpcUserId);
    await adminClient.from("clinics").delete().eq("id", clinicId);
  });
});
