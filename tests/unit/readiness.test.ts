import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/staff/role-templates", () => ({ getResolvedTemplate: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getResolvedTemplate } from "@/lib/staff/role-templates";
import { getStaffReadiness } from "@/lib/staff/readiness";

describe("getStaffReadiness error contract", () => {
  it("returns null when the staff query fails (never a false 'pending')", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              is: () => ({
                single: async () => ({ data: null, error: { message: "connection refused" } }),
              }),
            }),
          }),
        }),
      }),
    });
    const result = await getStaffReadiness("staff-1");
    expect(result).toBeNull();
  });

  it("returns null when the template resolution throws", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              is: () => ({
                single: async () => ({ data: { id: "staff-1", role: "RN", clinic_id: "clinic-1" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    (getResolvedTemplate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("template boom"));
    const result = await getStaffReadiness("staff-1");
    expect(result).toBeNull();
  });

  it("returns null when the credentials query fails (never a false 'pending')", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              is: () =>
                table === "staff_members"
                  ? { single: async () => ({ data: { id: "staff-1", role: "RN", clinic_id: "clinic-1" }, error: null }) }
                  : { data: null, error: { message: "connection refused" } },
            }),
          }),
        }),
      }),
    });
    (getResolvedTemplate as ReturnType<typeof vi.fn>).mockResolvedValue({
      templateId: "tpl-1",
      clinicId: "clinic-1",
      required: [{ credentialTypeId: "type-1", name: "RN License" }],
      optional: [],
    });
    const result = await getStaffReadiness("staff-1");
    expect(result).toBeNull();
  });
});
