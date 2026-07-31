import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ActionList } from "@/components/overview/action-list";
import type { ComplianceAction } from "@/lib/staff/compliance-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/credentials", () => ({
  verifyCredentialNow: vi.fn().mockResolvedValue({ success: true }),
}));

function makeAction(id: string, urgency: ComplianceAction["urgency"], name: string): ComplianceAction {
  return {
    id,
    staffMemberId: `staff-${id}`,
    staffName: `Staff ${name}`,
    role: "RN",
    actionType: urgency === "info" ? "verify_recommended" : urgency === "warning" ? "renew_expiring" : "renew_expired",
    credentialName: name,
    credentialId: `cred-${id}`,
    urgency,
    description: `${name} — needs attention`,
    risk: "Compliance risk",
    actionLabel: urgency === "info" ? "Verify" : "Renew",
    actionHref: `/dashboard/credentials/cred-${id}/renew`,
  };
}

const CRITICAL_ACTIONS = Array.from({ length: 12 }, (_, i) =>
  makeAction(`c${i}`, "critical", `Credential ${i}`),
);

// The credential name renders combined with the role ("RN · Credential 0"),
// so match on substrings via getAllByText and assert presence.
function hasText(container: HTMLElement, text: string): boolean {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    if (node.textContent !== null && node.textContent.includes(text)) return true;
  }
  return false;
}

describe("ActionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("returns null when there are no actions", () => {
    const { container } = render(<ActionList actions={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("caps a group at 10 and expands with +N more, then collapses with Show less", () => {
    const { container, getByRole } = render(<ActionList actions={CRITICAL_ACTIONS} />);

    // 10 visible, 2 hidden
    expect(hasText(container, "Credential 0")).toBe(true);
    expect(hasText(container, "Credential 9")).toBe(true);
    expect(hasText(container, "Credential 10")).toBe(false);
    expect(hasText(container, "Credential 11")).toBe(false);

    const expandButton = getByRole("button", { name: "+2 more" });
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandButton);

    expect(hasText(container, "Credential 11")).toBe(true);
    const collapseButton = getByRole("button", { name: "Show less" });
    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapseButton);

    expect(hasText(container, "Credential 10")).toBe(false);
    expect(getByRole("button", { name: "+2 more" })).toBeDefined();
  });

  it("does not render a toggle when the group fits within the cap", () => {
    const { queryByRole } = render(<ActionList actions={[makeAction("a", "critical", "One")]} />);
    expect(queryByRole("button", { name: /more/ })).toBeNull();
    expect(queryByRole("button", { name: "Show less" })).toBeNull();
  });

  it("renders the group header with the item count", () => {
    const { getAllByText } = render(<ActionList actions={CRITICAL_ACTIONS} />);
    expect(getAllByText("Critical (12)").length).toBeGreaterThan(0);
  });

  it("renders multiple urgency groups in order with distinct toggle ids", () => {
    const actions = [
      makeAction("w1", "warning", "Expiring"),
      makeAction("c1", "critical", "Expired"),
      makeAction("i1", "info", "Stale"),
    ];
    const { getAllByText, container } = render(<ActionList actions={actions} />);
    expect(getAllByText("Critical (1)").length).toBeGreaterThan(0);
    expect(getAllByText("Warning (1)").length).toBeGreaterThan(0);
    expect(getAllByText("Recommendations (1)").length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain('id="action-group-critical"');
    expect(container.innerHTML).toContain('id="action-group-warning"');
    expect(container.innerHTML).toContain('id="action-group-info"');
  });
});
