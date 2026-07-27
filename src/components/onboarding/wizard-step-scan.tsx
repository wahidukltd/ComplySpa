"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAuditRun } from "@/lib/actions/audit";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from "lucide-react";

export function WizardStepScan({ onNext }: { onNext: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<"scanning" | "results" | "skipped" | "error">("scanning");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(0);
  const [expiring, setExpiring] = useState(0);

  useEffect(() => {
    async function runScan() {
      const result = await createAuditRun();
      if (result.error) {
        setError(result.error);
        setStatus("error");
        return;
      }

      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) {
        setStatus("skipped");
        return;
      }

      const { data: userRecord } = await supabase
        .from("users")
        .select("clinic_id")
        .eq("auth_user_id", user.user.id)
        .maybeSingle();

      if (!userRecord) {
        setStatus("skipped");
        return;
      }

      const { data: credentials } = await supabase
        .from("credentials")
        .select("expiration_date")
        .eq("clinic_id", userRecord.clinic_id);

      let expiredCount = 0;
      let expiringCount = 0;
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      for (const c of credentials ?? []) {
        if (!c.expiration_date) continue;
        const exp = new Date(c.expiration_date);
        if (exp < now) {
          expiredCount++;
        } else if (exp < in30Days) {
          expiringCount++;
        }
      }

      setExpired(expiredCount);
      setExpiring(expiringCount);
      setStatus("results");
    }

    runScan();
  }, []);

  function handleDashboard() {
    router.push("/dashboard");
  }

  if (status === "skipped") {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-black">Readiness scan</CardTitle>
          <CardDescription className="text-muted-foreground">
            You can run your first readiness scan after adding staff and credentials from your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 pt-2">
            <Button type="button" onClick={onNext} className="flex-1">
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-xl text-black">
          {status === "scanning" ? "Running readiness scan..." : "Readiness scan complete"}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {status === "scanning"
            ? "Checking your credentials against the inspection checklist."
            : "Your first-readiness scan found the following:"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "scanning" && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-10 animate-spin text-primary" />
          </div>
        )}

        {status === "results" && (
          <>
            {expired === 0 && expiring === 0 && (
              <div className="rounded-md bg-[#E8F2EB] p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 size-8 text-[#4A8C5C]" />
                <p className="font-medium text-[#2D5C3A]">
                  No expired or expiring credentials found
                </p>
                <p className="mt-1 text-sm text-[#4A8C5C]">
                  Your clinic is in good shape.
                </p>
              </div>
            )}

            {expired > 0 && (
              <div className="rounded-md bg-destructive/10 p-4">
                <div className="flex items-center gap-2">
                  <XCircle className="size-5 text-destructive" />
                  <span className="font-medium text-destructive">
                    {expired} expired credential{expired !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-destructive/80">
                  These need immediate attention to avoid compliance gaps.
                </p>
              </div>
            )}

            {expiring > 0 && (
              <div className="rounded-md bg-[#FBF0E0] p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-[#C2853A]" />
                  <span className="font-medium text-[#7A4E1F]">
                    {expiring} credential{expiring !== 1 ? "s" : ""} expiring within 30 days
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#7A4E1F]">
                  Schedule renewals soon to stay compliant.
                </p>
              </div>
            )}

            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <p className="font-medium text-black">Audit created</p>
              <p className="mt-1">
                A readiness audit has been created. Review and complete it from the dashboard to get your full readiness score.
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <div className="rounded-md bg-destructive/10 p-4 text-destructive">
            <p className="font-medium">Scan could not be completed</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {status !== "scanning" && (
            <>
              <Button type="button" onClick={onNext} className="flex-1">
                Continue
              </Button>
              <Button type="button" variant="outline" onClick={handleDashboard}>
                Go to dashboard <ArrowRight className="ml-2 size-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
