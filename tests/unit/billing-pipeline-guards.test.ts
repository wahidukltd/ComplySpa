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

describe("Billing pipeline: single-writer + no storage loopholes (grep guards)", () => {
  const srcFiles = collectTsFiles(join(REPO_ROOT, "src"));

  const billingScope = srcFiles.filter((f) =>
    /api[\\/]polar|components[\\/]billing|lib[\\/]actions[\\/]billing|lib[\\/]billing|lib[\\/]polar/.test(f),
  );

  it("the billing scope never writes clinics directly — the webhook is the single writer", () => {
    const offenders = billingScope.flatMap((f) => {
      const content = readFileSync(f, "utf8");
      return content
        .split("\n")
        .map((line, i) => ({ line: line.trim(), i: i + 1, f }))
        .filter(
          ({ line }) =>
            /from\("clinics"\)\s*\.(update|insert|delete)/.test(line) ||
            /from\('clinics'\)\s*\.(update|insert|delete)/.test(line) ||
            /from\(`clinics`\)\s*\.(update|insert|delete)/.test(line),
        );
    });
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line}`)).toEqual([]);
  });

  it("the billing scope never touches storage (invoices are Polar-hosted; no local files)", () => {
    const banned = ["uploadDocument", "storage.from", "createSignedUrl"];
    const offenders = billingScope.flatMap((f) => {
      const content = readFileSync(f, "utf8");
      return content
        .split("\n")
        .map((line, i) => ({ line: line.trim(), i: i + 1, f }))
        .filter(({ line }) => banned.some((b) => line.includes(b)));
    });
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line}`)).toEqual([]);
  });

  it("every live Polar call gates on polarConfig.enabled (config is the single switch)", () => {
    // createPolarAdmin is the only constructor entry point and it short-circuits;
    // nothing else may construct the Polar client directly.
    const offenders = srcFiles
      .filter((f) => !f.replace(/\\/g, "/").includes("lib/polar/client.ts"))
      .flatMap((f) => {
        const content = readFileSync(f, "utf8");
        return content
          .split("\n")
          .map((line, i) => ({ line: line.trim(), i: i + 1, f }))
          .filter(({ line }) => /new Polar\(\{/.test(line));
      });
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line}`)).toEqual([]);
  });

  it("no app-initiated subscription mutation writes clinics via RPC (actions only drive Polar)", () => {
    const actions = srcFiles.filter((f) => f.includes("lib/actions/billing.ts"));
    const offenders = actions.flatMap((f) => {
      const content = readFileSync(f, "utf8");
      return content
        .split("\n")
        .map((line, i) => ({ line: line.trim(), i: i + 1, f }))
        .filter(({ line }) => /rpc\("update_clinic_subscription|rpc\('update_clinic_subscription/.test(line));
    });
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line}`)).toEqual([]);
  });

  it("no test-webhook behavior can operate as production billing (plan 2026-08-08 §4.12)", () => {
    // The test webhook input lives entirely in tests/ — src/ must contain no
    // signing machinery, no hardcoded test secrets, and no second webhook
    // route. (NODE_ENV branches are checked separately on the route only —
    // middleware/server legitimately use NODE_ENV for the cookie secure flag.)
    // Comments are stripped so prose about the test harness doesn't trip the
    // guard — the ban is on executable signing code, not documentation.
    const offenders = srcFiles.flatMap((f) => {
      const content = readFileSync(f, "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      return content
        .split("\n")
        .map((line, i) => ({ line: line.trim(), i: i + 1, f }))
        .filter(({ line }) =>
          /standardwebhooks|Webhook\.sign|whsec_test|TestSecret|webhook-test|webhooktest/.test(line),
        );
    });
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line}`)).toEqual([]);
  });

  it("the webhook route has no NODE_ENV/test branches and reads only POLAR_WEBHOOK_SECRET for its gate", () => {
    const route = srcFiles.find((f) => /api[\\/]polar[\\/]webhook[\\/]route/.test(f));
    expect(route).toBeTruthy();
    const content = readFileSync(route!, "utf8");
    const secretRead = content.match(/POLAR_WEBHOOK_SECRET/g) ?? [];
    expect(secretRead.length).toBeGreaterThan(0);
    expect(content).not.toMatch(/NODE_ENV|POLAR_TEST|POLAR_ACCESS_TOKEN/);
  });

  it("product availability gates both checkout entry points (plan 2026-08-08 §4.7/B7)", () => {
    const entryPoints = srcFiles.filter((f) =>
      /actions[\\/]billing\.ts|app[\\/]pricing[\\/]page/.test(f),
    );
    for (const f of entryPoints) {
      const content = readFileSync(f, "utf8");
      expect(content).toContain("productAvailable");
    }
  });

  it("no annual checkout path exists without the product-availability gate", () => {
    const checkout = srcFiles.find((f) => /lib[\\/]polar[\\/]checkout\.ts/.test(f));
    expect(checkout).toBeTruthy();
    const content = readFileSync(checkout!, "utf8");
    expect(content).toContain("productAvailable");
    expect(content).toContain("interval");
  });
});
