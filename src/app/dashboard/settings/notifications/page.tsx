import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationHistoryList } from "@/components/settings/notification-history-list";
import { deriveNotificationType, deriveFailureDetail } from "@/lib/utils/notification-history";
import type { NotificationRow, NotificationSummary } from "@/components/settings/notification-history-list";

export const dynamic = "force-dynamic";

export default async function NotificationHistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) redirect("/sign-in");

  const { data: userRecord, error: userErr } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (userErr || !userRecord) redirect("/onboarding");

  const [alertsResult, deliveredResult, failedResult, pendingResult] = await Promise.all([
    supabase
      .from("alert_logs")
      .select(`
        id,
        alert_type,
        recipient,
        sent_at,
        delivery_status,
        days_before_expiration,
        resend_webhook_id,
        credential:credentials!alert_logs_credential_id_fkey(
          staff:staff_members!credentials_staff_member_id_fkey(name),
          credential_type:credential_types!credentials_credential_type_id_fkey(name)
        )
      `)
      .eq("clinic_id", userRecord.clinic_id)
      .order("sent_at", { ascending: false })
      .limit(100),
    supabase
      .from("alert_logs")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", userRecord.clinic_id)
      .eq("delivery_status", "delivered"),
    supabase
      .from("alert_logs")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", userRecord.clinic_id)
      .eq("delivery_status", "failed"),
    supabase
      .from("alert_logs")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", userRecord.clinic_id)
      .eq("delivery_status", "pending"),
  ]);

  // An audit surface must never masquerade as empty on a query failure — a
  // discarded .error would render "No notifications recorded yet" + zeroed
  // counts as if they were real (overview.ts throwOnError convention).
  const queryError =
    alertsResult.error ?? deliveredResult.error ?? failedResult.error ?? pendingResult.error;
  if (queryError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Notification History"
          description="Every reminder generated for your clinic, with delivery status."
        />
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Failed to load notification history. Please try again.
          </p>
        </div>
      </div>
    );
  }

  const rows: NotificationRow[] = (alertsResult.data ?? []).map((alert) => {
    const type = deriveNotificationType(alert.days_before_expiration);
    const credential = alert.credential;
    const typeName = credential?.credential_type?.name ?? null;
    const staffName = credential?.staff?.name ?? null;
    const credentialLabel =
      typeName && staffName
        ? `${typeName} — ${staffName}`
        : (typeName ?? staffName ?? null);
    return {
      id: alert.id,
      kind: type.kind,
      typeLabel: type.label,
      credentialLabel,
      recipient: alert.recipient,
      sentAt: alert.sent_at,
      deliveryStatus: alert.delivery_status as NotificationRow["deliveryStatus"],
      failureDetail: deriveFailureDetail(alert.delivery_status, Boolean(alert.resend_webhook_id)),
    };
  });

  const summary: NotificationSummary = {
    delivered: deliveredResult.count ?? 0,
    failed: failedResult.count ?? 0,
    pending: pendingResult.count ?? 0,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notification History"
        description="Every reminder generated for your clinic, with delivery status. Reminders are sent automatically as credentials near expiration."
      />
      <NotificationHistoryList rows={rows} summary={summary} />
    </div>
  );
}

