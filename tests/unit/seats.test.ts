import { describe, it, expect } from "vitest";
import { deriveSeatSummary } from "@/lib/utils/seats";

const member = { is_pending: false };
const pending = { is_pending: true };

describe("deriveSeatSummary (plan 2026-08-08)", () => {
  it("solo: owner only → 1 of 1 used, 0 available, at capacity, not over limit", () => {
    expect(deriveSeatSummary([member], 1)).toEqual({
      used: 1,
      available: 0,
      pending: 0,
      atCapacity: true,
      overLimit: false,
    });
  });

  it("practice empty-of-invites: owner + 1 member → 2 of 3, 1 available", () => {
    const s = deriveSeatSummary([member, member], 3);
    expect(s.used).toBe(2);
    expect(s.available).toBe(1);
    expect(s.atCapacity).toBe(false);
    expect(s.overLimit).toBe(false);
  });

  it("practice at capacity: 3 of 3 → 0 available, at capacity", () => {
    expect(deriveSeatSummary([member, member, member], 3)).toMatchObject({
      used: 3,
      available: 0,
      atCapacity: true,
      overLimit: false,
    });
  });

  it("pending invitations count toward used seats (owner + 1 pending = 2 of 3)", () => {
    const s = deriveSeatSummary([member, pending], 3);
    expect(s.used).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.available).toBe(1);
  });

  it("pending invite at capacity: 3 of 3 with a pending hold → at capacity with pending flagged", () => {
    const s = deriveSeatSummary([member, member, pending], 3);
    expect(s).toMatchObject({ used: 3, pending: 1, available: 0, atCapacity: true });
  });

  it("over-limit (reachable via pending plan change): 3 members vs solo max 1 → available clamps to 0, overLimit true", () => {
    const s = deriveSeatSummary([member, member, member], 1);
    expect(s).toEqual({ used: 3, available: 0, pending: 0, atCapacity: true, overLimit: true });
  });

  it("maxUsers 0 guard: any members → overLimit, available 0", () => {
    const s = deriveSeatSummary([member], 0);
    expect(s).toEqual({ used: 1, available: 0, pending: 0, atCapacity: true, overLimit: true });
  });

  it("empty user list: 0 of N, available N, not at capacity", () => {
    expect(deriveSeatSummary([], 3)).toEqual({
      used: 0,
      available: 3,
      pending: 0,
      atCapacity: false,
      overLimit: false,
    });
  });
});
