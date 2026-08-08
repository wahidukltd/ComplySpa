"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  Receipt,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  getBillingPollState,
  cancelSubscription,
  reactivateSubscription,
  changePlan,
  getCheckoutUrl,
  getPortalUrl,
  getInvoiceUrl,
  type BillingOverviewData,
  type BillingPollState,
} from "@/lib/actions/billing";
import { PLAN_NAME, formatCurrency, MONEY_PROBLEM_STATES, paymentCopy, type StatusCta, type StatusTone, type SubscriptionInterval } from "@/lib/billing/copy";
import type { PlanId } from "@/lib/polar/checkout";

// Functional-palette tone styles — the single map for every status surface on
// the page (badge, danger panel, pending-sync strip). Same colors the banner
// used per state, now grouped by tone (plan 2026-08-08 §4.4).
const TONE_STYLE: Record<StatusTone, { border: string; bg: string; color: string; badgeColor: string; badgeBg: string }> = {
  positive: { border: "#4A8C5C", bg: "#EDF5F0", color: "#2F6B3F", badgeColor: "#2F6B3F", badgeBg: "#EDF5F0" },
  warning: { border: "#C2853A", bg: "#FFFBEB", color: "#92400E", badgeColor: "#92400E", badgeBg: "#FFFBEB" },
  danger: { border: "#B8443A", bg: "#FEF2F2", color: "#7A2A26", badgeColor: "#7A2A26", badgeBg: "#FEF2F2" },
  neutral: { border: "#6E97A7", bg: "#F0F4F5", color: "#3D5F6B", badgeColor: "#3D5F6B", badgeBg: "#F0F4F5" },
};

const INVOICE_STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  paid: { label: "Paid", color: "#2F6B3F", bg: "#EDF5F0" },
  pending: { label: "Pending", color: "#92400E", bg: "#FFFBEB" },
  refunded: { label: "Refunded", color: "rgba(0,0,0,0.55)", bg: "#F0F4F5" },
  voided: { label: "Voided", color: "#7A2A26", bg: "#FEF2F2" },
};

const CANCEL_REASONS: { value: string; label: string }[] = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "switched_service", label: "Switched to another service" },
  { value: "unused", label: "Not using it enough" },
  { value: "customer_service", label: "Dissatisfied with support" },
  { value: "low_quality", label: "Dissatisfied with the product" },
  { value: "too_complex", label: "Too complicated to use" },
  { value: "other", label: "Other" },
];

interface Props {
  overview: BillingOverviewData;
}

// Single client surface for every subscription mutation on the page. The DB is
// converged by the webhook, so after each action this component polls the
// overview until the clinic row matches what was asked for, then refreshes —
// the visible state machine the experience blueprint §6.7 requires.
export function BillingClient({ overview }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutSuccess = searchParams.get("checkout") === "success";
  const checkoutCancelled = searchParams.get("checkout") === "cancelled";

  // Server-rendered overview; the page re-renders on refresh after convergence.
  const data = overview;
  const [pendingSync, setPendingSync] = useState(checkoutSuccess);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelComment, setCancelComment] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [cancelledNotice, setCancelledNotice] = useState(checkoutCancelled);
  const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null);
  const pollRef = useRef<{ stop: () => void } | null>(null);

  // Single-surface status (plan 2026-08-08): the plan card is the only status
  // surface. The server-derived presentation (state/tone/badge/headline/
  // detail/CTA) is read-only for the client; pending-sync is a transient
  // strip, never a card state.
  const status = data.status;
  const showDangerPanel = !pendingSync && MONEY_PROBLEM_STATES.includes(status.state);
  const pendingSyncCopy = syncTimedOut
    ? checkoutSuccess
      ? "Still confirming your subscription — if you completed checkout, it can take a moment to appear. Refresh in a few minutes."
      : "Still confirming — refresh if it takes more than a few minutes."
    : checkoutSuccess
      ? "Confirming your subscription…"
      : "Confirming your change…";

  // Verified payment-card copy (plan F3): every state comes from the backend
  // truth (no customer / Polar-listed card / verified absence / degraded).
  const payment = paymentCopy(data.payment.state, {
    brand: data.payment.brand,
    last4: data.payment.last4,
    isTrial: data.isTrial,
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      pollRef.current.stop();
      pollRef.current = null;
    }
  }, []);

  // Poll until the DB converges with the requested change (resume pattern:
  // 3s interval, 60s cap — the webhook usually lands within seconds). The
  // poll reads the DB-only snapshot (review 2026-08-05): the full overview
  // fires up to 3 live Polar calls per invocation, which would have been
  // ~60 Polar calls per pending-sync window.
  const pollUntil = useCallback(
    (predicate: (d: BillingPollState) => boolean, onDone: () => void) => {
      stopPolling();
      let stopped = false;
      const interval = setInterval(async () => {
        if (stopped) return;
        try {
          const res = await getBillingPollState();
          if (res.error || !res.data) return;
          if (predicate(res.data)) {
            stopped = true;
            clearInterval(interval);
            clearTimeout(timeout);
            pollRef.current = null;
            onDone();
          }
        } catch {
          // retry on next interval
        }
      }, 3000);
      const timeout = setTimeout(() => {
        stopped = true;
        clearInterval(interval);
        pollRef.current = null;
        // Review 2026-08-05: never silently drop back to the stale
        // server-rendered state — keep the confirming strip visible with
        // timeout copy so the user knows the change is still converging.
        setSyncTimedOut(true);
      }, 60000);
      pollRef.current = { stop: () => { stopped = true; clearInterval(interval); clearTimeout(timeout); } };
    },
    [stopPolling],
  );

  const finishSync = useCallback(() => {
    setPendingSync(false);
    setSyncTimedOut(false);
    router.refresh();
  }, [router]);

  // Entering with ?checkout=success: poll until the server confirms the
  // subscription is paid (review SEC1 — the green confirmation is only
  // rendered AFTER server-verified convergence, never from the forgeable
  // query param alone). The param itself only starts a neutral confirming
  // strip; pendingSync starts true when the param is present (initial state,
  // no effect-time setState).
  useEffect(() => {
    if (!checkoutSuccess) return;
    pollUntil(
      (d) => d.isPaid,
      () => {
        toast.success("Your payment was received — your subscription is now active.");
        finishSync();
      },
    );
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutSuccess]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const isOwner = data.canMutate;

  async function handleSubscribe(plan: PlanId, interval: SubscriptionInterval = "monthly") {
    setBusy("subscribe");
    try {
      const res = await getCheckoutUrl(plan, interval);
      if (res.error || !res.url) {
        if (res.error) toast.error(res.error);
        else router.push("/pricing");
        return;
      }
      window.open(res.url, "_blank", "noopener");
      // No pendingSync here (plan F4): nothing has been paid yet — the
      // checkout tab is still open. The confirming flow enters truthfully via
      // the ?checkout=success return param. The poll below is a silent
      // convergence bonus: if the DB flips while this tab sits idle, the page
      // refreshes on its own without claiming any confirming state.
      pollUntil(
        (d) => d.isPaid,
        () => finishSync(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handlePortal() {
    setBusy("portal");
    try {
      const res = await getPortalUrl();
      if (res.error || !res.url) {
        toast.error(res.error ?? "Failed to open the billing portal.");
        return;
      }
      window.open(res.url, "_blank", "noopener");
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    setBusy("cancel");
    try {
      const res = await cancelSubscription({
        reason: cancelReason ?? undefined,
        comment: cancelComment.trim() || undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setCancelOpen(false);
      setCancelReason(null);
      setCancelComment("");
      setAcknowledged(false);
      setPendingSync(true);
      pollUntil(
        (d) => d.cancelAtPeriodEnd,
        () => finishSync(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleResume() {
    setBusy("resume");
    try {
      const res = await reactivateSubscription();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPendingSync(true);
      pollUntil(
        (d) => !d.cancelAtPeriodEnd,
        () => finishSync(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleChangePlan(plan: PlanId, interval: SubscriptionInterval) {
    setBusy("plan-change");
    try {
      const res = await changePlan(plan, interval);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPlanOpen(false);
      // Review 2026-08-05 + plan 2026-08-08 §4.7: plan/interval changes
      // register a PENDING update applied at the start of the next billing
      // period (SDK `PendingSubscriptionUpdate` semantics) — the DB does NOT
      // flip within the poll window, so polling for convergence would always
      // time out silently. The Polar call succeeding IS the completion:
      // confirm and refresh.
      toast.success(`Plan change scheduled — takes effect at the start of your next billing cycle.`);
      finishSync();
    } finally {
      setBusy(null);
    }
  }

  async function handleInvoice(orderId: string) {
    setInvoiceLoading(orderId);
    try {
      const res = await getInvoiceUrl(orderId);
      if (res.error || !res.url) {
        toast.error(res.error ?? "Failed to load the invoice.");
        return;
      }
      window.open(res.url, "_blank", "noopener");
    } finally {
      setInvoiceLoading(null);
    }
  }

  function dismissCancelled() {
    setCancelledNotice(false);
    router.replace("/dashboard/settings/billing");
  }

  return (
    <div className="space-y-6">
      {/* Transient query-param notice — checkout cancelled (neutral, truthful
          in every state). The checkout-success signal is NOT a green notice
          from the param: the confirming strip runs, and the green
          confirmation only appears after the server confirms the paid state
          (review SEC1). */}
      {cancelledNotice && (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border p-4 text-sm"
          style={{ borderColor: "rgba(0,0,0,0.12)", backgroundColor: "#F8FAFB", color: "rgba(0,0,0,0.55)" }}
          role="status"
        >
          <p>Checkout cancelled — nothing was charged.</p>
          <button onClick={dismissCancelled} className="text-sm underline" aria-label="Dismiss">
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Plan card — the single status surface (plan 2026-08-08) */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full min-w-0">
            {/* Transient confirming strip — the page's one live region */}
            {pendingSync && (
              <div
                className="mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm"
                style={{ borderColor: TONE_STYLE.neutral.border, backgroundColor: TONE_STYLE.neutral.bg, color: TONE_STYLE.neutral.color }}
                role="status"
                aria-live="polite"
              >
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                <span>{pendingSyncCopy}</span>
              </div>
            )}

            {/* Money-problem states: full-width panel at the top of the card
                (prominence without a second surface) */}
            {showDangerPanel && status.headline && (
              <div
                className="mb-4 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  borderColor: TONE_STYLE[status.tone].border,
                  backgroundColor: TONE_STYLE[status.tone].bg,
                  color: TONE_STYLE[status.tone].color,
                }}
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">{status.headline}</p>
                    {status.detail && <p className="mt-0.5 text-sm opacity-80">{status.detail}</p>}
                  </div>
                </div>
                {isOwner && status.cta && status.cta.kind !== "refresh" && (
                  <StatusCtaButton
                    cta={status.cta}
                    busy={busy}
                    onSubscribe={handleSubscribe}
                    onPortal={handlePortal}
                    onResume={handleResume}
                    onRefresh={() => router.refresh()}
                  />
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{data.planName}</CardTitle>
              {data.interval && !data.isTrial && (
                <span
                  className="inline-flex h-5 items-center rounded-full px-2 text-xs font-medium"
                  style={{ backgroundColor: "#F0F4F5", color: "#3D5F6B" }}
                >
                  {data.interval === "annual" ? "Annual" : "Monthly"}
                </span>
              )}
              {!showDangerPanel && status.badgeLabel && (
                <StatusBadge tone={status.tone} label={status.badgeLabel} />
              )}
            </div>
            <p className="mt-1.5 text-sm font-medium" style={{ color: "#000000" }}>
              {data.planCard.priceLine}
            </p>
            {!showDangerPanel && status.headline && (
              <p className="mt-1 text-sm font-medium" style={{ color: status.tone === "warning" ? "#92400E" : "#000000" }}>
                {status.headline}
              </p>
            )}
            {!showDangerPanel && status.detail && (
              <p className="mt-1 text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
                {status.detail}
              </p>
            )}
            {status.cta?.kind === "refresh" && (
              <button onClick={() => router.refresh()} className="mt-2 text-sm underline" style={{ color: "#3D5F6B" }}>
                {status.cta.label}
              </button>
            )}
          </div>
          {isOwner && (
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              {!showDangerPanel && status.cta && status.cta.kind !== "refresh" && (
                <StatusCtaButton
                  cta={status.cta}
                  busy={busy}
                  onSubscribe={handleSubscribe}
                  onPortal={handlePortal}
                  onResume={handleResume}
                  onRefresh={() => router.refresh()}
                />
              )}
              {/* Management actions stay available in every paid state (review
                  N4 — a money-problem panel must not leave the user with zero
                  valid actions); only an ENDED subscription loses "Change
                  plan", and unconfigured Polar hides both (they cannot
                  succeed). */}
              {data.isPaid && data.polarEnabled && status.state !== "canceled" && (
                <Button size="sm" onClick={() => setPlanOpen(true)} disabled={busy !== null || data.planCard.cancelAtPeriodEnd}>
                  Change plan
                </Button>
              )}
              {data.isPaid && data.polarEnabled && (
                <Button variant="outline" size="sm" onClick={handlePortal} disabled={busy !== null}>
                  Manage billing
                  <ExternalLink className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* 2. Usage row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" style={{ color: "#6E97A7" }} />
              Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
              {data.usage.users} of {data.entitlements.maxUsers} users — includes you
            </p>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: "#F0F4F5" }}
              role="progressbar"
              aria-valuenow={Math.min(data.usage.users, data.entitlements.maxUsers)}
              aria-valuemin={0}
              aria-valuemax={data.entitlements.maxUsers}
              aria-label="User seats used"
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, (data.usage.users / Math.max(1, data.entitlements.maxUsers)) * 100)}%`,
                  backgroundColor: data.usage.users >= data.entitlements.maxUsers ? "#C2853A" : "#6E97A7",
                }}
              />
            </div>
            {data.usage.users >= data.entitlements.maxUsers && (
              <p className="mt-2 text-xs" style={{ color: "#92400E" }}>
                Full — remove a member or upgrade to add more users.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" style={{ color: "#6E97A7" }} />
              Plan limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <LimitRow label="Staff members" used={data.usage.staff} max={data.entitlements.maxStaff} />
            <LimitRow label="Credentials" used={data.usage.credentials} max={data.entitlements.maxCredentials} />
            <div className="flex justify-between">
              <span style={{ color: "rgba(0,0,0,0.55)" }}>Report tier</span>
              <span style={{ color: "#000000" }}>
                {data.entitlements.reportTier === "basic"
                  ? "Basic Compliance Report"
                  : data.entitlements.reportTier === "audit"
                    ? "Audit-Ready Compliance Report"
                    : "No reports"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Payment card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" style={{ color: "#6E97A7" }} />
            Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium" style={{ color: "#000000" }}>
                {payment.line}
              </p>
              <p className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
                {payment.sub}
              </p>
            </div>
            {isOwner && data.payment.state !== "no-account" && (
              <Button variant="outline" size="sm" onClick={handlePortal} disabled={busy !== null}>
                Update payment method
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <div>
              <p className="font-medium" style={{ color: "#000000" }}>Billing contact</p>
              <p className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
                {data.billingContact ?? "—"} (account owner)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" style={{ color: "#6E97A7" }} />
            Invoices
          </CardTitle>
          {data.isPaid && isOwner && (
            <Button variant="ghost" size="sm" onClick={handlePortal} disabled={busy !== null}>
              View all invoices
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {data.invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <FileText className="mb-2 size-6" style={{ color: "rgba(0,0,0,0.3)" }} aria-hidden="true" />
              <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
                Invoices appear here after your first charge.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs" style={{ borderColor: "rgba(0,0,0,0.08)", color: "rgba(0,0,0,0.55)" }}>
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Description</th>
                    <th className="pb-2 pr-4 font-medium">Amount</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium"><span className="sr-only">View</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((inv) => {
                    const status = INVOICE_STATUS_STYLE[inv.status] ?? INVOICE_STATUS_STYLE.pending!;
                    return (
                      <tr key={inv.id} className="border-b last:border-0" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                        <td className="py-2.5 pr-4" style={{ color: "#000000" }}>
                          {new Date(inv.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="py-2.5 pr-4" style={{ color: "rgba(0,0,0,0.55)" }}>{inv.description}</td>
                        <td className="py-2.5 pr-4 font-medium" style={{ color: "#000000" }}>
                          {formatCurrency(inv.amountCents, inv.currency)}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className="inline-flex h-5 items-center rounded-full px-2 text-xs font-medium"
                            style={{ backgroundColor: status.bg, color: status.color }}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleInvoice(inv.id)}
                            disabled={invoiceLoading !== null}
                          >
                            {invoiceLoading === inv.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <>
                                View invoice
                                <ExternalLink className="size-3.5" />
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Danger zone — paid clinics only */}
      {data.isPaid && (
        <div className="rounded-lg border p-6" style={{ borderColor: "rgba(184,68,58,0.35)" }}>
          <h3 className="text-base font-medium" style={{ color: "#7A2A26" }}>
            {data.planCard.cancelAtPeriodEnd ? "Subscription scheduled to end" : "Cancel subscription"}
          </h3>
          {data.planCard.cancelAtPeriodEnd ? (
            <>
              <p className="mt-1 text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
                Your plan continues through {data.planCard.periodEnd ? new Date(data.planCard.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "the end of your billing period"}. Nothing is deleted — change your mind any time before then.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {isOwner && (
                  <Button onClick={handleResume} disabled={busy !== null} style={{ backgroundColor: "#4A8C5C", color: "#FFFFFF" }}>
                    {busy === "resume" ? <Loader2 className="size-4 animate-spin" /> : null}
                    Resume subscription
                  </Button>
                )}
                {isOwner && (
                  <button onClick={handlePortal} disabled={busy !== null} className="text-sm underline" style={{ color: "rgba(0,0,0,0.55)" }}>
                    Need to end today? Cancel immediately in the portal
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
                Cancelling keeps full access until the end of your billing period. Your staff, credentials, documents, reports, and settings stay exactly as they are.
              </p>
              {isOwner && (
                <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                  <DialogTrigger
                    render={
                      <Button variant="destructive" className="mt-3">
                        Cancel subscription
                      </Button>
                    }
                  />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancel subscription?</DialogTitle>
                      <DialogDescription>
                        Your {data.planName} plan continues through{" "}
                        {data.planCard.periodEnd
                          ? new Date(data.planCard.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "the end of your billing period"}
                        . You&apos;ll keep full access until then — nothing is deleted. Staff, credentials, documents, reports, and settings stay exactly as they are.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <fieldset>
                        <legend className="mb-2 text-sm font-medium" style={{ color: "#000000" }}>
                          Can we ask why? <span className="font-normal" style={{ color: "rgba(0,0,0,0.55)" }}>(optional)</span>
                        </legend>
                        <div className="space-y-1.5">
                          {CANCEL_REASONS.map((r) => (
                            <label key={r.value} className="flex items-center gap-2 text-sm" style={{ color: "#000000" }}>
                              <input
                                type="radio"
                                name="cancel-reason"
                                value={r.value}
                                checked={cancelReason === r.value}
                                onChange={() => setCancelReason(r.value)}
                                className="size-4 accent-[#6E97A7]"
                              />
                              {r.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <Label htmlFor="cancel-comment">Anything else? (optional)</Label>
                      <textarea
                        id="cancel-comment"
                        value={cancelComment}
                        onChange={(e) => setCancelComment(e.target.value)}
                        maxLength={500}
                        rows={2}
                        placeholder="Tell us what would have kept you"
                        className="w-full rounded-lg border p-2 text-sm outline-none focus:ring-2 focus:ring-[#6E97A7]/40"
                        style={{ borderColor: "rgba(0,0,0,0.12)" }}
                      />
                      <label className="flex items-start gap-2 text-sm" style={{ color: "#000000" }}>
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          onChange={(e) => setAcknowledged(e.target.checked)}
                          className="mt-0.5 size-4 accent-[#6E97A7]"
                        />
                        I understand my subscription ends on{" "}
                        {data.planCard.periodEnd
                          ? new Date(data.planCard.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "the last day of my billing period"}
                        .
                      </label>
                    </div>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline">Keep my subscription</Button>} />
                      <Button onClick={handleCancel} disabled={busy !== null || !acknowledged} className="text-[#7A2A26]">
                        {busy === "cancel" ? <Loader2 className="size-4 animate-spin" /> : null}
                        Continue to cancel
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </div>
      )}

      {/* Change plan dialog — 2×2 plan × interval matrix (plan 2026-08-08 §4.7) */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              Your plan changes at the start of your next billing cycle — no charge today.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {data.planOptions.map((option) => {
              const isCurrent =
                data.plan === option.plan && (data.interval ?? "monthly") === option.interval;
              return (
                <button
                  key={`${option.plan}-${option.interval}`}
                  onClick={() => handleChangePlan(option.plan, option.interval)}
                  disabled={busy !== null || isCurrent || !option.available}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-[#F8FAFB] disabled:opacity-50"
                  style={{ borderColor: isCurrent ? "#6E97A7" : "rgba(0,0,0,0.12)", backgroundColor: isCurrent ? "#F0F4F5" : "#FFFFFF" }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#000000" }}>
                      {PLAN_NAME[option.plan]}
                      <span className="ml-1.5 text-xs font-normal" style={{ color: "rgba(0,0,0,0.55)" }}>
                        {option.interval === "annual" ? "Annual" : "Monthly"}
                      </span>
                    </p>
                    <p className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
                      {option.available
                        ? `${option.maxStaff} staff · ${option.maxCredentials} credentials · ${option.maxUsers} ${option.maxUsers === 1 ? "user" : "users"} · ${option.reportLabel}`
                        : "This billing option isn't available yet."}
                    </p>
                  </div>
                  <span className="text-sm font-medium" style={{ color: "#6E97A7" }}>
                    {isCurrent
                      ? "Current"
                      : `${formatCurrency(option.price * 100)}/${option.interval === "annual" ? "yr" : "mo"}`}
                    {!isCurrent && option.available && busy !== "plan-change" ? <ArrowRight className="ml-1 inline size-3.5" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
            Data over the new plan&apos;s limit stays saved but paused — nothing is deleted. Annual billing starts at your next billing cycle.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Keep current plan</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const style = TONE_STYLE[tone];
  return (
    <span className="inline-flex h-5 items-center rounded-full px-2 text-xs font-medium" style={{ backgroundColor: style.badgeBg, color: style.badgeColor }}>
      {label}
    </span>
  );
}

// The one action a state supports (plan 2026-08-08): renders the status CTA
// from the pure presentation — never a button without a valid action. The
// refresh CTA renders inline in the card body for all roles instead.
function StatusCtaButton({
  cta,
  busy,
  onSubscribe,
  onPortal,
  onResume,
  onRefresh,
}: {
  cta: Exclude<StatusCta, null>;
  busy: string | null;
  onSubscribe: (plan: PlanId, interval: SubscriptionInterval) => void;
  onPortal: () => void;
  onResume: () => void;
  onRefresh: () => void;
}) {
  switch (cta.kind) {
    case "subscribe":
      return (
        <Button size="sm" onClick={() => onSubscribe(cta.plan, cta.interval)} disabled={busy !== null} style={{ backgroundColor: "#6E97A7", color: "#FFFFFF" }}>
          {busy === "subscribe" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {cta.label}
        </Button>
      );
    case "resume":
      return (
        <Button size="sm" onClick={onResume} disabled={busy !== null} style={{ backgroundColor: "#4A8C5C", color: "#FFFFFF" }}>
          {busy === "resume" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {cta.label}
        </Button>
      );
    case "portal":
      return (
        <Button size="sm" onClick={onPortal} disabled={busy !== null} style={{ backgroundColor: "#6E97A7", color: "#FFFFFF" }}>
          {busy === "portal" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {cta.label}
        </Button>
      );
    case "compare-plans":
      return (
        <Button size="sm" variant="outline" render={<Link href="/pricing" />}>
          {cta.label}
        </Button>
      );
    case "refresh":
      return (
        <Button size="sm" variant="outline" onClick={onRefresh}>
          {cta.label}
        </Button>
      );
  }
}

function LimitRow({ label, used, max }: { label: string; used: number; max: number }) {
  const atLimit = used >= max;
  return (
    <div className="flex justify-between">
      <span style={{ color: "rgba(0,0,0,0.55)" }}>{label}</span>
      <span style={{ color: atLimit ? "#92400E" : "#000000" }}>
        {used} of {max}
        {atLimit ? " — full" : ""}
      </span>
    </div>
  );
}
