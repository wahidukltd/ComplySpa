import { describe, it, expect } from "vitest";
import { isClinicScopedReportPath, REPORT_FILE_PATTERN } from "@/lib/utils/report-file";

const CLINIC = "11111111-2222-3333-4444-555555555555";
const OTHER_CLINIC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("isClinicScopedReportPath", () => {
  it("accepts a valid path in the caller's clinic folder", () => {
    expect(isClinicScopedReportPath(`${CLINIC}/1722800000000-report-abc123.pdf`, CLINIC)).toBe(true);
  });

  it("rejects a path in another clinic's folder (tenant isolation)", () => {
    expect(isClinicScopedReportPath(`${OTHER_CLINIC}/1722800000000-report.pdf`, CLINIC)).toBe(false);
  });

  it("rejects non-UUID first segments", () => {
    expect(isClinicScopedReportPath(`not-a-uuid/1722800000000-report.pdf`, CLINIC)).toBe(false);
    expect(isClinicScopedReportPath(`clinics/${CLINIC}/report.pdf`, CLINIC)).toBe(false);
  });

  it("rejects non-PDF extensions", () => {
    expect(isClinicScopedReportPath(`${CLINIC}/1722800000000-report.png`, CLINIC)).toBe(false);
    expect(isClinicScopedReportPath(`${CLINIC}/1722800000000-report.exe`, CLINIC)).toBe(false);
    expect(isClinicScopedReportPath(`${CLINIC}/1722800000000-report.pdf.exe`, CLINIC)).toBe(false);
  });

  it("rejects path traversal and extra segments", () => {
    expect(isClinicScopedReportPath(`${CLINIC}/../${OTHER_CLINIC}/report.pdf`, CLINIC)).toBe(false);
    expect(isClinicScopedReportPath(`${CLINIC}/sub/report.pdf`, CLINIC)).toBe(false);
    expect(isClinicScopedReportPath(`${CLINIC}`, CLINIC)).toBe(false);
  });

  it("rejects empty and malformed input", () => {
    expect(isClinicScopedReportPath("", CLINIC)).toBe(false);
    expect(isClinicScopedReportPath(" ", CLINIC)).toBe(false);
    expect(isClinicScopedReportPath(`${CLINIC}/.pdf`, CLINIC)).toBe(false);
  });

  it("REPORT_FILE_PATTERN only matches the exact safe charset", () => {
    expect(REPORT_FILE_PATTERN.test(`${CLINIC}/report-1._-9.pdf`)).toBe(true);
    expect(REPORT_FILE_PATTERN.test(`${CLINIC}/report&evil.pdf`)).toBe(false);
    expect(REPORT_FILE_PATTERN.test(`${CLINIC}/report%2e%2e.pdf`)).toBe(false);
  });
});
