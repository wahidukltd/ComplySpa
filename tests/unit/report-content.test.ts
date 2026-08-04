import { describe, it, expect } from "vitest";
import {
  formatReportDate,
  formatReportDateTime,
  formatAlertWindows,
  summarizeStaffCredentials,
  splitUpcoming,
  buildAttentionItems,
  type UpcomingItem,
} from "@/lib/pdf/report-content";
import type { ReportData } from "@/lib/pdf/report-content";
import { reportFileName } from "@/lib/report/copy";

describe("reportFileName", () => {
  it("slugs a plain clinic name", () => {
    expect(reportFileName("Lux Med Spa")).toBe("compliance-report-lux-med-spa.pdf");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(reportFileName("Smith & Jones, LLC")).toBe("compliance-report-smith-jones-llc.pdf");
    expect(reportFileName("  Aura   Clinic  ")).toBe("compliance-report-aura-clinic.pdf");
  });

  it("removes non-ASCII characters", () => {
    expect(reportFileName("Dermá Spa")).toBe("compliance-report-derm-spa.pdf");
  });

  it("handles an empty name deterministically", () => {
    expect(reportFileName("")).toBe("compliance-report-.pdf");
  });
});

describe("formatReportDate", () => {
  it("formats date-only strings as Month D, YYYY", () => {
    expect(formatReportDate("2026-08-05")).toBe("August 5, 2026");
  });

  it("formats the first and last days of the year correctly", () => {
    expect(formatReportDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatReportDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("formats full ISO timestamps as the UTC date only", () => {
    expect(formatReportDate("2026-08-05T14:30:00.000Z")).toBe("August 5, 2026");
  });

  it("returns an empty string for null and undefined", () => {
    expect(formatReportDate(null)).toBe("");
    expect(formatReportDate(undefined)).toBe("");
    expect(formatReportDate("")).toBe("");
  });

  it("returns the input unchanged when it cannot be parsed", () => {
    expect(formatReportDate("not-a-date")).toBe("not-a-date");
  });

  it("never silently normalizes calendar-impossible dates", () => {
    expect(formatReportDate("2026-02-30")).toBe("2026-02-30");
    expect(formatReportDate("2026-04-31")).toBe("2026-04-31");
    expect(formatReportDate("2026-13-01")).toBe("2026-13-01");
    expect(formatReportDate("2026-00-10")).toBe("2026-00-10");
  });

  it("does not shift dates across UTC midnight", () => {
    expect(formatReportDate("2026-08-05T23:59:59.999Z")).toBe("August 5, 2026");
    expect(formatReportDate("2026-08-05T00:00:00.000Z")).toBe("August 5, 2026");
  });
});

describe("formatReportDateTime", () => {
  it("formats a full ISO timestamp with an explicit UTC suffix", () => {
    expect(formatReportDateTime("2026-08-05T14:30:00.000Z")).toBe(
      "August 5, 2026 at 2:30 PM UTC",
    );
  });

  it("handles midnight and noon boundaries", () => {
    expect(formatReportDateTime("2026-08-05T00:05:00.000Z")).toBe(
      "August 5, 2026 at 12:05 AM UTC",
    );
    expect(formatReportDateTime("2026-08-05T12:00:00.000Z")).toBe(
      "August 5, 2026 at 12:00 PM UTC",
    );
  });

  it("returns the input unchanged when it cannot be parsed", () => {
    expect(formatReportDateTime("nope")).toBe("nope");
  });
});

describe("formatAlertWindows", () => {
  it("formats reminder windows with a d suffix", () => {
    expect(formatAlertWindows(["90", "60", "30", "7"])).toBe("90d, 60d, 30d, 7d");
  });

  it("renders the escalation window as Escalation, not -7d", () => {
    expect(formatAlertWindows(["90", "60", "30", "7", "-7"])).toBe(
      "90d, 60d, 30d, 7d, Escalation",
    );
  });

  it("returns an empty string for no alerts", () => {
    expect(formatAlertWindows([])).toBe("");
  });
});

describe("summarizeStaffCredentials", () => {
  it("counts credentials by stored status", () => {
    const creds = [
      { status: "valid" },
      { status: "valid" },
      { status: "expiring" },
      { status: "expired" },
      { status: "unknown" },
    ];
    expect(summarizeStaffCredentials(creds)).toEqual({
      valid: 2,
      expiring: 1,
      expired: 1,
    });
  });

  it("returns zeros for an empty credential list", () => {
    expect(summarizeStaffCredentials([])).toEqual({ valid: 0, expiring: 0, expired: 0 });
  });
});

describe("splitUpcoming", () => {
  const item = (daysLeft: number): UpcomingItem => ({
    staffName: "Priya",
    credentialType: "RN License",
    expirationDate: "2026-09-01",
    daysLeft,
    status: "expiring",
    alertsSent: [],
  });

  it("sends 0–30 day items to attention and 31–90 to upcoming", () => {
    const { attention, upcoming } = splitUpcoming([
      item(45),
      item(0),
      item(30),
      item(31),
      item(90),
    ]);
    expect(attention.map((i) => i.daysLeft)).toEqual([0, 30]);
    expect(upcoming.map((i) => i.daysLeft)).toEqual([31, 45, 90]);
  });

  it("sorts attention by days left ascending", () => {
    const { attention } = splitUpcoming([item(30), item(5), item(20)]);
    expect(attention.map((i) => i.daysLeft)).toEqual([5, 20, 30]);
  });

  it("returns empty arrays for no items", () => {
    const { attention, upcoming } = splitUpcoming([]);
    expect(attention).toEqual([]);
    expect(upcoming).toEqual([]);
  });

  it("never duplicates a row across the two tables", () => {
    const items = [item(15), item(60), item(30), item(31)];
    const { attention, upcoming } = splitUpcoming(items);
    const total = attention.length + upcoming.length;
    expect(total).toBe(items.length);
  });
});

describe("buildAttentionItems", () => {
  const baseData = (overrides: Partial<ReportData> = {}): ReportData => ({
    clinic: { name: "Lux Med Spa", address: null, state: null },
    medicalDirector: "Dr. Sarah Johnson",
    generatedBy: "owner@luxmedspa.com",
    staffMembers: [
      {
        id: "s1",
        name: "Priya Sharma",
        role: "RN",
        hireDate: "2025-01-15",
        credentials: [
          {
            type: "RN License",
            licenseNumber: "RN123",
            state: "CA",
            issueDate: "2025-01-15",
            expirationDate: "2025-12-31",
            status: "expired",
            lastVerified: null,
          },
          {
            type: "ACLS Certification",
            licenseNumber: null,
            state: null,
            issueDate: "2025-01-15",
            expirationDate: "2030-01-01",
            status: "valid",
            lastVerified: null,
          },
        ],
      },
      {
        id: "s2",
        name: "Alex Chen",
        role: "MA",
        hireDate: "2026-06-01",
        credentials: [],
      },
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
    ],
    reportId: "11111111-2222-3333-4444-555555555555",
    generatedAt: "2026-08-05T14:30:00.000Z",
    ...overrides,
  });

  it("lists expired credentials first, sorted by expiration date", () => {
    const data = baseData();
    data.staffMembers[0].credentials.push({
      type: "BLS Certification",
      licenseNumber: null,
      state: null,
      issueDate: "2024-01-01",
      expirationDate: "2024-06-01",
      status: "expired",
      lastVerified: null,
    });
    const { credentialItems } = buildAttentionItems(data);
    expect(credentialItems[0]).toMatchObject({
      type: "BLS Certification",
      status: "expired",
    });
    expect(credentialItems[1]).toMatchObject({
      type: "RN License",
      status: "expired",
    });
  });

  it("appends expiring-within-30-day items after expired, by days left", () => {
    const { credentialItems } = buildAttentionItems(baseData());
    expect(credentialItems.map((i) => i.status)).toEqual(["expired", "expiring"]);
    expect(credentialItems[1]).toMatchObject({
      staffName: "Priya Sharma",
      type: "CPR/BLS",
    });
  });

  it("excludes credentials with no expiration date", () => {
    const data = baseData();
    data.staffMembers[0].credentials[0].expirationDate = null;
    data.staffMembers[0].credentials[0].status = "valid";
    const { credentialItems } = buildAttentionItems(data);
    expect(credentialItems.map((i) => i.type)).not.toContain("RN License");
  });

  it("flags a missing medical director first among admin items", () => {
    const data = baseData({ medicalDirector: null });
    const { adminItems } = buildAttentionItems(data);
    expect(adminItems[0]).toEqual({
      kind: "no_md",
      message: "Medical director not designated",
    });
    expect(adminItems[1]).toEqual({
      kind: "no_creds",
      message: "Alex Chen has no tracked credentials",
    });
  });

  it("flags staff with no tracked credentials", () => {
    const { adminItems } = buildAttentionItems(baseData());
    expect(adminItems.map((i) => i.kind)).toEqual(["no_creds"]);
  });

  it("returns empty arrays for a fully clean clinic", () => {
    const data = baseData();
    data.staffMembers[0].credentials[0].status = "valid";
    data.staffMembers[0].credentials[0].expirationDate = "2030-01-01";
    data.staffMembers[1].credentials.push({
      type: "CPR/BLS",
      licenseNumber: null,
      state: null,
      issueDate: "2026-01-01",
      expirationDate: "2027-01-01",
      status: "valid",
      lastVerified: null,
    });
    data.upcoming = [];
    const { credentialItems, adminItems } = buildAttentionItems(data);
    expect(credentialItems).toEqual([]);
    expect(adminItems).toEqual([]);
  });
});
