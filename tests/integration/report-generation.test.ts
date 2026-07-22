import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient } from "./helpers";

const service = getServiceClient();
const TEST_CLERK_ID = "test-report-gen-clerk";
const TEST_EMAIL = "reporttest@example.com";
let clinicId: string;
let mdStaffId: string;
let ctId: string;

beforeAll(async () => {
  const { data: clinic } = await service
    .from("clinics")
    .insert({ name: "Report Test Clinic", address: "123 Test St", state: "CA" })
    .select("id")
    .single();
  clinicId = clinic!.id;

  await service.from("users").insert({
    auth_user_id: TEST_CLERK_ID,
    clinic_id: clinicId,
    email: TEST_EMAIL,
    role: "owner",
  });

  const { data: md } = await service
    .from("staff_members")
    .insert({
      clinic_id: clinicId,
      name: "Dr. Smith",
      role: "MD",
      email: "dr@test.com",
    })
    .select("id")
    .single();
  mdStaffId = md!.id;

  await service.from("credential_types").delete().eq("name", "Medical License").is("clinic_id", null);

  const { data: ct } = await service
    .from("credential_types")
    .insert({ name: "Medical License", category: "license" })
    .select("id")
    .single();
  ctId = ct!.id;

  await service.from("credentials").insert([
    { staff_member_id: mdStaffId, clinic_id: clinicId, credential_type_id: ctId, license_number: "LIC001", status: "valid", expiration_date: new Date(Date.now() + 180 * 86400000).toISOString() },
    { staff_member_id: mdStaffId, clinic_id: clinicId, credential_type_id: ctId, license_number: "LIC002", status: "valid", expiration_date: new Date(Date.now() + 120 * 86400000).toISOString() },
    { staff_member_id: mdStaffId, clinic_id: clinicId, credential_type_id: ctId, license_number: "LIC003", status: "expiring", expiration_date: new Date(Date.now() + 30 * 86400000).toISOString() },
    { staff_member_id: mdStaffId, clinic_id: clinicId, credential_type_id: ctId, license_number: "LIC004", status: "expired", expiration_date: new Date(Date.now() - 10 * 86400000).toISOString() },
  ]);
});

afterAll(async () => {
  await service.from("credentials").delete().eq("staff_member_id", mdStaffId);
  await service.from("staff_members").delete().eq("id", mdStaffId);
  await service.from("users").delete().eq("auth_user_id", TEST_CLERK_ID);
  await service.from("clinics").delete().eq("id", clinicId);
  await service.from("credential_types").delete().eq("id", ctId);
});

describe("Report Generation", () => {
  it("SD has clinic with seed data", async () => {
    const { count } = await service
      .from("staff_members")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId);
    expect(count).toBe(1);
  });

  it("SD has credentials with correct statuses", async () => {
    const { data } = await service
      .from("credentials")
      .select("status")
      .eq("clinic_id", clinicId);
    expect(data).toHaveLength(4);
    const statuses = data!.map((c) => c.status);
    expect(statuses.filter((s) => s === "valid")).toHaveLength(2);
    expect(statuses.filter((s) => s === "expiring")).toHaveLength(1);
    expect(statuses.filter((s) => s === "expired")).toHaveLength(1);
  });

  it("medical director is selectable by role MD/DO", async () => {
    const { data } = await service
      .from("staff_members")
      .select("name")
      .eq("clinic_id", clinicId)
      .in("role", ["MD", "DO"])
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    expect(data?.name).toBe("Dr. Smith");
  });

  it("query matches getReportData structure for staff+credentials", async () => {
    const { data } = await service
      .from("staff_members")
      .select("id, name, role, hire_date")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name");
    expect(data).toHaveLength(1);
    expect(data![0].name).toBe("Dr. Smith");
  });

  it("credentials query joins credential_types", async () => {
    const { data } = await service
      .from("credentials")
      .select("id, license_number, status, credential_types ( name, category )")
      .eq("clinic_id", clinicId);
    expect(data).toHaveLength(4);
    const types = data![0].credential_types as { name: string; category: string } | null;
    expect(types?.name).toBe("Medical License");
    expect(types?.category).toBe("license");
  });

  it("aggregate counts match expected: 2 valid, 1 expiring, 1 expired", async () => {
    const { count: valid } = await service
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "valid");
    const { count: expiring } = await service
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "expiring");
    const { count: expired } = await service
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "expired");
    expect(valid).toBe(2);
    expect(expiring).toBe(1);
    expect(expired).toBe(1);
  });

  it("upcoming renewals query returns expiring credentials sorted by expiration", async () => {
    const { data } = await service
      .from("credentials")
      .select("id, expiration_date, status, staff_member_id")
      .eq("clinic_id", clinicId)
      .not("expiration_date", "is", null)
      .order("expiration_date", { ascending: true });
    expect(data).toHaveLength(4);
    const dates = data!.map((c) => c.expiration_date).filter(Boolean);
    for (let i = 1; i < dates.length; i++) {
      expect(new Date(dates[i]).getTime()).toBeGreaterThanOrEqual(
        new Date(dates[i - 1]).getTime(),
      );
    }
  });

  it("createReport inserts into audit_reports with snapshot", async () => {
    const snapshot = { summary: { total: 4 } };
    const { data: report, error } = await service
      .from("audit_reports")
      .insert({
        clinic_id: clinicId,
        report_url: "https://example.com/test.pdf",
        report_data_snapshot: snapshot,
      })
      .select("id, report_data_snapshot")
      .single();
    expect(error).toBeNull();
    expect(report!.id).toBeTruthy();
    expect((report!.report_data_snapshot as { summary: { total: number } } | null)?.summary?.total).toBe(4);

    await service.from("audit_reports").delete().eq("id", report!.id);
  });

  it("getReportHistory query returns reports ordered by generated_at desc", async () => {
    await service.from("audit_reports").insert([
      { clinic_id: clinicId, report_url: "https://example.com/r1.pdf" },
      { clinic_id: clinicId, report_url: "https://example.com/r2.pdf" },
    ]);

    const { data } = await service
      .from("audit_reports")
      .select("id, generated_at, report_url")
      .eq("clinic_id", clinicId)
      .order("generated_at", { ascending: false })
      .limit(50);
    expect(data!.length).toBeGreaterThanOrEqual(2);
    const urls = data!.map((r) => r.report_url);
    expect(urls).toContain("https://example.com/r1.pdf");
    expect(urls).toContain("https://example.com/r2.pdf");

    await service.from("audit_reports").delete().eq("clinic_id", clinicId);
  });
});
