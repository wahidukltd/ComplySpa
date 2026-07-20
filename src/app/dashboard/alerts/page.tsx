import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { AlertList } from "@/components/alerts/alert-list";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createClient();
  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("clerk_user_id", userId)
    .single();

  if (!userRecord) redirect("/onboarding");

  const { data: alerts } = await supabase
    .from("alert_logs")
    .select("id, clinic_id, credential_id, alert_type, recipient, sent_at, delivery_status, days_before_expiration, created_at, resend_webhook_id, twilio_message_id")
    .eq("clinic_id", userRecord.clinic_id)
    .order("sent_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alert History"
        description="Record of all expiration alerts sent for your clinic's credentials."
      />
      <AlertList alerts={alerts ?? []} />
    </div>
  );
}
