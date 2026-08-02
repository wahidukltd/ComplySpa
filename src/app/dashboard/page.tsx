import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOverviewData, type OverviewData, type RecentChange } from "@/lib/staff/overview";
import { ActionList } from "@/components/overview/action-list";
import { formatUnresolvedStaff } from "@/lib/utils/overview-copy";
import { RefreshButton } from "@/components/overview/refresh-button";
import { UpdatedLabel } from "@/components/overview/updated-label";
import { formatRelativeTime } from "@/lib/utils/date";
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Plus,
  CheckCircle2,
  ArrowRight,
  FileText,
  UserPlus,
  ClipboardCheck,
  Info,
} from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<"ready" | "at_risk" | "non_compliant" | "pending", { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-[#4A8C5C]/10 text-[#4A8C5C]" },
  at_risk: { label: "At risk", className: "bg-[#C2853A]/10 text-[#C2853A]" },
  non_compliant: { label: "Non-compliant", className: "bg-destructive/10 text-destructive" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
};

function ComplianceHealthCard({
  complianceHealth,
  staffSummary,
  hasStaff,
  renderedAt,
  sectionErrors,
  readinessUnavailable,
}: {
  complianceHealth: { score: number; readyCount: number; totalStaff: number };
  staffSummary: OverviewData["staffSummary"];
  hasStaff: boolean;
  renderedAt: string;
  sectionErrors: string[];
  readinessUnavailable: boolean;
}) {
  const scoreColor = !hasStaff || readinessUnavailable
    ? "text-foreground"
    : staffSummary.nonCompliant > 0
      ? "text-destructive"
      : complianceHealth.score === 100
        ? "text-[#4A8C5C]"
        : "text-[#C2853A]";

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <div className="text-5xl font-bold tracking-tight xl:text-6xl">
            <span className={scoreColor}>
              {readinessUnavailable ? "—" : hasStaff ? `${complianceHealth.score}%` : "—"}
            </span>
          </div>
          <div>
            <p className="text-lg font-semibold">Compliance Health</p>
            <p className="text-sm text-muted-foreground">
              {readinessUnavailable
                ? "Readiness data unavailable — try again"
                : hasStaff
                  ? `${complianceHealth.readyCount} of ${complianceHealth.totalStaff} Staff Work-Ready`
                  : "No staff yet — add your first team member to get started"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap gap-1.5">
            {hasStaff && !readinessUnavailable && (
              <>
                <Link href="/dashboard/staff" className={cn(STATUS_CHIP.ready.className, "rounded-full px-2.5 py-1 text-xs font-medium")}>
                  Ready {staffSummary.ready}
                </Link>
                <Link href="/dashboard/staff" className={cn(STATUS_CHIP.at_risk.className, "rounded-full px-2.5 py-1 text-xs font-medium")}>
                  At risk {staffSummary.atRisk}
                </Link>
                <Link href="/dashboard/staff" className={cn(STATUS_CHIP.non_compliant.className, "rounded-full px-2.5 py-1 text-xs font-medium")}>
                  Non-compliant {staffSummary.nonCompliant}
                </Link>
                <Link href="/dashboard/staff" className={cn(STATUS_CHIP.pending.className, "rounded-full px-2.5 py-1 text-xs font-medium")}>
                  Pending {staffSummary.pending}
                </Link>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            <UpdatedLabel renderedAt={renderedAt} />
            {sectionErrors.length > 0 && " · some sections couldn't load"}
            <RefreshButton />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function NeedsAttentionSection({
  actions,
  actionCounts,
  staffSummary,
  hasStaff,
  hasCredentials,
  readinessUnavailable,
  sectionErrors,
  canVerify,
}: {
  actions: OverviewData["actions"];
  actionCounts: OverviewData["actionCounts"];
  staffSummary: OverviewData["staffSummary"];
  hasStaff: boolean;
  hasCredentials: boolean;
  readinessUnavailable: boolean;
  sectionErrors: string[];
  canVerify: boolean;
}) {
  // Truthful all-clear: every staff member is actually work-ready. Gating on
  // the action list alone is wrong — the actions builder skips `pending` staff
  // by design, so a clinic with a pending member would show "all ready" while
  // the hero says otherwise. A failed actions section is treated like failed
  // readiness: the empty fallback must not masquerade as a clean slate.
  const actionsUnavailable = sectionErrors.includes("actions");
  const dataUnavailable = readinessUnavailable || actionsUnavailable;
  const allWorkReady =
    hasStaff && !dataUnavailable && staffSummary.ready === staffSummary.total && staffSummary.total > 0;
  const hasUnresolvedStaff =
    hasStaff && !dataUnavailable && (staffSummary.pending > 0 || staffSummary.atRisk > 0 || staffSummary.nonCompliant > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Needs Attention
          {actionCounts.critical + actionCounts.warning > 0 && (
            <span className="ml-2 text-destructive">{actionCounts.critical + actionCounts.warning}</span>
          )}
        </h2>
      </div>

      {!hasStaff ? null : dataUnavailable ? (
        <Card className="border-muted-foreground/20 bg-muted/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Compliance data unavailable</p>
              <p className="text-xs text-muted-foreground">
                Compliance status could not be computed. Try refreshing to see your compliance actions.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : actions.length > 0 ? (
        <ActionList actions={actions} canVerify={canVerify} />
      ) : allWorkReady ? (
        <Card className="border-[#4A8C5C]/30 bg-[#4A8C5C]/5">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2 className="size-5 shrink-0 text-[#4A8C5C]" />
            <div>
              <p className="text-sm font-medium">No action required — every staff member is ready to work</p>
              <p className="text-xs text-muted-foreground">All required credentials are present and valid.</p>
            </div>
          </CardContent>
        </Card>
      ) : hasUnresolvedStaff ? (
        <Card className="border-muted-foreground/20 bg-muted/20">
          <CardContent className="flex items-center gap-3 py-4">
            <Info className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No urgent action required</p>
              <p className="text-xs text-muted-foreground">
                {formatUnresolvedStaff(staffSummary.pending, staffSummary.atRisk, staffSummary.nonCompliant)}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasStaff && !hasCredentials && (
        <Card style={{ borderColor: "#FBF0E0", backgroundColor: "#FFFFFF" }}>
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 shrink-0" style={{ color: "#C2853A" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "#7A4E1F" }}>
                Your staff has no credentials tracked yet
              </p>
              <p className="mt-0.5 text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
                Add credentials to start tracking expirations and compliance.{" "}
                <Link href="/dashboard/staff" className="underline" style={{ color: "#6E97A7" }}>
                  Go to staff
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {hasStaff && hasCredentials && !dataUnavailable && actions.length === 0 && (
        <Card className="border-warning bg-warning-tint">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 shrink-0 text-warning" />
            <p className="text-sm text-warning-foreground">
              Have you verified that each provider&apos;s procedures match their license scope for your state?
              Staff performing services outside their license is the #1 cause of board investigations.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CredentialHealthCards({ credentialHealth, hasStaff }: { credentialHealth: OverviewData["credentialHealth"]; hasStaff: boolean }) {
  if (!hasStaff) return null;
  const items = [
    { label: "Total Credentials", value: credentialHealth.total, icon: ShieldCheck, className: "text-foreground" },
    { label: "Valid", value: credentialHealth.valid, icon: CheckCircle2, className: "text-[#4A8C5C]" },
    { label: "Expiring Soon", value: credentialHealth.expiring, icon: Clock, className: "text-[#C2853A]" },
    { label: "Expired", value: credentialHealth.expired, icon: AlertTriangle, className: "text-destructive" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Credentials</h2>
        <Link href="/dashboard/credentials" className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
          View all
          <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href="/dashboard/credentials">
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
                  <Icon className={cn("size-4", item.label === "Expired" ? "text-destructive" : "text-muted-foreground")} />
                </CardHeader>
                <CardContent>
                  <div className={cn("text-2xl font-bold xl:text-3xl", item.className)}>{item.value}</div>
                  {item.label === "Expiring Soon" && <p className="text-xs text-muted-foreground">Within 90 days</p>}
                  {item.label === "Expired" && <p className="text-xs text-muted-foreground">Requires immediate action</p>}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const RECENT_CHANGE_META: Record<RecentChange["type"], { label: string; icon: typeof FileText }> = {
  credential_added: { label: "Credential added", icon: FileText },
  staff_added: { label: "Staff added", icon: UserPlus },
  onboarding_completed: { label: "Requirement completed", icon: ClipboardCheck },
};

function RecentChanges({ changes }: { changes: RecentChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent changes</h2>
      <Card>
        <CardContent className="divide-y divide-border pt-0">
          {changes.map((change) => {
            const meta = RECENT_CHANGE_META[change.type];
            const Icon = meta.icon;
            return (
              <Link key={change.id} href={change.href} className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{change.title}</p>
                  <p className="text-xs text-muted-foreground">{meta.label}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={change.timestamp}>
                  {formatRelativeTime(change.timestamp)}
                </time>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) redirect("/sign-in");
  const { data: userRecord, error: userErr } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (userErr || !userRecord) redirect("/onboarding");

  const data = await getOverviewData(userRecord.clinic_id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight xl:text-3xl">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Your clinic&apos;s compliance status at a glance.
          </p>
        </div>
        {data.hasStaff && (
          <div className="flex gap-2">
            <Link href="/dashboard/staff/new" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
              <Plus className="size-4" />
              Add staff
            </Link>
            <Link href="/dashboard/staff" className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}>
              <Users className="size-4" />
              View staff
            </Link>
          </div>
        )}
      </div>

      {data.systemHealth.degraded && (
        <Card className="border-warning bg-warning-tint">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-warning-foreground">System health alert</p>
              <ul className="mt-1 space-y-1 text-sm text-warning-foreground">
                {data.systemHealth.issues.map((issue) => (
                  <li key={`${issue.kind}:${issue.label}`}>{issue.label}</li>
                ))}
              </ul>
              <Link
                href="/dashboard/settings/notifications?status=failed"
                className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline"
              >
                Investigate in Notification History →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <ComplianceHealthCard
        complianceHealth={data.complianceHealth}
        staffSummary={data.staffSummary}
        hasStaff={data.hasStaff}
        renderedAt={data.renderedAt}
        sectionErrors={data.sectionErrors}
        readinessUnavailable={data.readinessUnavailable}
      />

      <NeedsAttentionSection
        actions={data.actions}
        actionCounts={data.actionCounts}
        staffSummary={data.staffSummary}
        hasStaff={data.hasStaff}
        hasCredentials={data.hasCredentials}
        readinessUnavailable={data.readinessUnavailable}
        sectionErrors={data.sectionErrors}
        canVerify={userRecord.role !== "viewer"}
      />

      <CredentialHealthCards credentialHealth={data.credentialHealth} hasStaff={data.hasStaff} />

      <RecentChanges changes={data.recentChanges} />

      {!data.hasStaff && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" />
              No staff members yet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add your first staff member to start tracking licenses, certifications, and compliance deadlines.
            </p>
            <Link href="/dashboard/staff/new" className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}>
              <Plus className="size-4" />
              Add your first staff member
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
