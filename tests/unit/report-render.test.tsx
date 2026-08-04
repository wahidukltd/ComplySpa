import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { ComplianceReport, type ReportData } from "@/lib/pdf/report-template";
import { renderReportBuffer } from "@/lib/report/render";

// Headless render regression guard for the plan's #1 risk: PDF layout
// breakage at scale. Renders both tiers over empty/typical/max datasets and
// asserts a real PDF is produced without throwing.

function makeCredential(type: string, status: string, expirationDate: string | null) {
  return {
    type,
    licenseNumber: type === "RN License" ? "RN-0001" : null,
    state: type === "RN License" ? "CA" : null,
    issueDate: "2025-01-15",
    expirationDate,
    status,
    lastVerified: null,
  };
}

function makeStaff(id: string, name: string, credentials: ReportData["staffMembers"][number]["credentials"]) {
  return { id, name, role: "RN", hireDate: "2025-01-15", credentials };
}

function makeReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    clinic: { name: "Lux Med Spa", address: "123 Main St", state: "CA" },
    medicalDirector: "Dr. Sarah Johnson",
    generatedBy: "owner@luxmedspa.com",
    staffMembers: [
      makeStaff("s1", "Priya Sharma", [
        makeCredential("RN License", "expired", "2025-12-31"),
        makeCredential("ACLS Certification", "valid", "2030-01-01"),
      ]),
      makeStaff("s2", "Alex Chen", []),
    ],
    summary: {
      total: 2,
      valid: 1,
      expiring: 0,
      expired: 1,
      noExpiration: 0,
      byCategory: { license: 1, training: 1, insurance: 0, agreement: 0 },
    },
    upcoming: [
      {
        staffName: "Priya Sharma",
        credentialType: "CPR/BLS",
        expirationDate: "2026-08-20",
        daysLeft: 15,
        status: "expiring",
        alertsSent: ["90", "60"],
      },
      {
        staffName: "Alex Chen",
        credentialType: "BLS Certification",
        expirationDate: "2026-10-01",
        daysLeft: 57,
        status: "expiring",
        alertsSent: ["90"],
      },
    ],
    reportId: "11111111-2222-3333-4444-555555555555",
    generatedAt: "2026-08-05T14:30:00.000Z",
    ...overrides,
  };
}

function makeLargeDataset(): ReportData {
  // Practice cap: 15 staff x 20 credentials = 300, with a spread of statuses
  // and alert windows (incl. the -7 escalation window) to exercise every
  // section under pagination pressure.
  const staffMembers: ReportData["staffMembers"] = [];
  const upcoming: ReportData["upcoming"] = [];
  let total = 0;
  let valid = 0;
  let expired = 0;
  let expiring = 0;
  for (let s = 1; s <= 15; s++) {
    const credentials = [];
    for (let c = 1; c <= 20; c++) {
      const bucket = (s + c) % 3;
      let status = "valid";
      let expirationDate = "2030-01-01";
      if (bucket === 1) {
        status = "expiring";
        expirationDate = `2026-09-${String(10 + c).padStart(2, "0")}`;
        const daysLeft = 20 + ((s + c) % 40);
        upcoming.push({
          staffName: `Staff ${s}`,
          credentialType: `Credential ${c}`,
          expirationDate,
          daysLeft,
          status,
          alertsSent: daysLeft <= 30 ? ["90", "60", "30"] : ["90", "60"],
        });
        if (daysLeft <= 30) {
          upcoming[upcoming.length - 1].alertsSent.push("-7");
        }
        expiring++;
      } else if (bucket === 2) {
        status = "expired";
        expirationDate = "2025-06-01";
        expired++;
      } else {
        valid++;
      }
      total++;
      credentials.push(makeCredential(`Credential ${c}`, status, expirationDate));
    }
    staffMembers.push(makeStaff(`s${s}`, `Staff ${s}`, credentials));
  }
  return makeReportData({
    staffMembers,
    upcoming,
    summary: {
      total,
      valid,
      expiring,
      expired,
      noExpiration: 0,
      byCategory: { license: Math.ceil(total / 4), training: Math.ceil(total / 4), insurance: Math.ceil(total / 4), agreement: Math.floor(total / 4) },
    },
  });
}

const EMPTY = makeReportData({
  staffMembers: [],
  upcoming: [],
  summary: {
    total: 0,
    valid: 0,
    expiring: 0,
    expired: 0,
    noExpiration: 0,
    byCategory: { license: 0, training: 0, insurance: 0, agreement: 0 },
  },
});

async function render(data: ReportData, tier: "basic" | "audit"): Promise<Buffer> {
  const buffer = await renderToBuffer(<ComplianceReport data={data} tier={tier} />);
  expect(buffer).toBeInstanceOf(Buffer);
  expect(buffer.length).toBeGreaterThan(2000);
  expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  return buffer;
}

describe("ComplianceReport headless render", () => {
  it("renders the audit tier for an empty clinic", async () => {
    await render(EMPTY, "audit");
  }, 30000);

  it("renders the basic tier for an empty clinic", async () => {
    await render(EMPTY, "basic");
  }, 30000);

  it("renders the audit tier for a typical clinic", async () => {
    await render(makeReportData(), "audit");
  }, 30000);

  it("renders the basic tier for a typical clinic", async () => {
    await render(makeReportData(), "basic");
  }, 30000);

  it("renders the audit tier at the practice cap (15 staff / 300 credentials) without truncation errors", async () => {
    await render(makeLargeDataset(), "audit");
  }, 60000);

  it("renders the basic tier at the practice cap without truncation errors", async () => {
    await render(makeLargeDataset(), "basic");
  }, 60000);

  it("renders a clinic with no medical director and no-expiration credentials", async () => {
    const data = makeReportData({
      medicalDirector: null,
      summary: {
        total: 3,
        valid: 3,
        expiring: 0,
        expired: 0,
        noExpiration: 1,
        byCategory: { license: 1, training: 1, insurance: 1, agreement: 0 },
      },
    });
    data.staffMembers[0].credentials.push(
      makeCredential("Workers Comp Insurance", "valid", null),
    );
    await render(data, "audit");
  }, 30000);

  it("renderReportBuffer (the server delivery entry point) returns a valid PDF", async () => {
    const buffer = await renderReportBuffer(makeLargeDataset(), "audit");
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(2000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 60000);
});
