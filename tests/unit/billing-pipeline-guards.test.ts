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
});
