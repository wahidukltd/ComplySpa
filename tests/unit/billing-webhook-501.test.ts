import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";

// Plan §4.12 DoD + review finding 13: the webhook must return an opaque 501
// when POLAR_WEBHOOK_SECRET is unconfigured — production without the env var
// can never accept test events (they would fail signature verification
// anyway, since the test secret is never set in production).

type Route = typeof import("@/app/api/polar/webhook/route");
let POST: Route["POST"];

async function importRoute() {
  vi.resetModules();
  ({ POST } = await import("@/app/api/polar/webhook/route"));
}

describe("webhook 501-when-unconfigured (plan §4.12)", () => {
  beforeAll(async () => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "");
    await importRoute();
  }, 30000);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an opaque 501 without disclosing integration state", async () => {
    const req = new Request("http://localhost/api/polar/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "subscription.active", data: {} }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("Not configured");
    // Opaque: no hint about the provider, secrets, or setup steps. (The
    // generic "Not configured" wording itself is the allowed surface.)
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(/polar|secret|env|webhook|endpoint/);
  });
});
