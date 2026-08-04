import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === ".next" || entry === "graphify-out") continue;
    const s = statSync(full);
    if (s.isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("Report pipeline: no loophole wiring (grep guards)", () => {
  const srcFiles = collectTsFiles(join(REPO_ROOT, "src"));

  it("every /sign-up link carries a plan (no mandatory-plan redirect loop)", () => {
    const offenders = srcFiles
      .filter((f) => !f.includes("page.tsx") || f.includes("sign-up"))
      .flatMap((f) => {
        const content = readFileSync(f, "utf8");
        return content
          .split("\n")
          .map((line, i) => ({ line: `${line.trim()}`, i: i + 1, f }))
          .filter(({ line }) => /href=("|'|\{`)[^"']*\/sign-up("|'|\}`)/.test(line) && !line.includes("?plan="));
      });
    // SignUpForm's own internal links (sign-in footer) are allowed; the gate is
    // enforced at the page level (src/app/sign-up/page.tsx).
    const realOffenders = offenders.filter((o) => !o.f.includes("components/auth/SignUpForm.tsx"));
    expect(realOffenders.map((o) => `${o.f}:${o.i}`)).toEqual([]);
  });

  it("canEmailReports is only derived inside the entitlement resolver", () => {
    const offenders = srcFiles
      .flatMap((f) => {
        const content = readFileSync(f, "utf8");
        return content
          .split("\n")
          .map((line, i) => ({ line, i: i + 1, f }))
          .filter(
            ({ line }) =>
              line.includes("canEmailReports:") &&
              !line.includes("reportTier !==") &&
              !line.includes("boolean") // interface declaration
          );
      });
    expect(offenders.map((o) => `${o.f}:${o.i}`)).toEqual([]);
  });

  it("no references to the removed report history surface remain", () => {
    const offenders = srcFiles.flatMap((f) => {
      const content = readFileSync(f, "utf8");
      return content
        .split("\n")
        .map((line, i) => ({ line, i: i + 1, f }))
        .filter(({ line }) => /createReport|getReportHistory|audit_reports|createAuditRun|hasInspectionReadiness/.test(line));
    });
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line.trim()}`)).toEqual([]);
  });

  it("no in-memory rate limiter Maps remain in API routes", () => {
    const offenders = srcFiles
      .filter((f) => f.includes("api"))
      .flatMap((f) => {
        const content = readFileSync(f, "utf8");
        return content
          .split("\n")
          .map((line, i) => ({ line, i: i + 1, f }))
          .filter(({ line }) => /new Map<string, \{ count/.test(line) || /RATE_LIMIT_MAX/.test(line) || /checkReportRateLimit|checkRateLimit/.test(line));
      });
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line.trim()}`)).toEqual([]);
  });

  it("getEntitlements/getPlanLimits call sites pass trial_plan where a clinic row is read", () => {
    const offenders = srcFiles.flatMap((f) => {
      const content = readFileSync(f, "utf8");
      return content
        .split("\n")
        .map((line, i) => ({ line, i: i + 1, f }))
        .filter(({ line }) => /getEntitlements\([^,)]+\)|getPlanLimits\([^,)]+\)|getReportTier\([^,)]+\)/.test(line));
    });
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line.trim()}`)).toEqual([]);
  });
});
