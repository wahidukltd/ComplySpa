import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getComplianceActions } from "@/lib/staff/compliance-actions";
import { ActionList } from "./action-list";
import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const actions = await getComplianceActions();

  const criticalCount = actions.filter((a) => a.urgency === "critical").length;
  const warningCount = actions.filter((a) => a.urgency === "warning").length;
  const infoCount = actions.filter((a) => a.urgency === "info").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Actions"
        description="Prioritized compliance actions for your clinic."
      >
        {actions.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                Critical: {criticalCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#C2853A]/10 px-2.5 py-1 font-medium text-[#C2853A]">
                Warning: {warningCount}
              </span>
            )}
            {infoCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                Info: {infoCount}
              </span>
            )}
          </div>
        )}
      </PageHeader>

      {actions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="size-8 text-[#4A8C5C]" />
            <p className="text-lg font-medium">All caught up</p>
            <p className="text-sm text-muted-foreground">
              No compliance actions needed. Every staff member is ready to work.
            </p>
            <Link href="/dashboard/staff" className={cn(buttonVariants({ variant: "outline" }), "mt-2 gap-1.5")}>
              View staff list
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ActionList actions={actions} />
      )}
    </div>
  );
}
