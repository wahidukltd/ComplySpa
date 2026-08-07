"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Users, ShieldCheck, ArrowRight, CreditCard } from "lucide-react";
import { getCheckoutUrl } from "@/lib/actions/billing";

export function WizardStepDone({
  staffCount,
  credentialCount,
  plan,
}: {
  staffCount: number;
  credentialCount: number;
  plan?: string | null;
}) {
  const router = useRouter();
  const planLabel = plan === "solo" ? "Solo" : plan === "practice" ? "Practice" : null;

  async function handleSubscribe() {
    if (!plan) return;
    // Trial-path subscribe defaults to monthly (matches the displayed
    // monthly anchor; full interval choice lives on the pricing page and the
    // Billing change dialog — plan 2026-08-08 §4.7).
    const res = await getCheckoutUrl(plan as "solo" | "practice", "monthly");
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.url) {
      window.open(res.url, "_blank", "noopener");
      router.push("/dashboard");
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[#E8F2EB]">
          <CheckCircle2 className="size-6 text-[#5B8A6A]" />
        </div>
        <CardTitle className="text-xl text-black">
          You&apos;re all set
        </CardTitle>
        <CardDescription className="text-[rgba(0,0,0,0.55)]">
          {planLabel
            ? `Your clinic is ready. Activate your ${planLabel} subscription to start.`
            : "Your clinic is configured and ready to go. Here&apos;s what you set up:"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg p-4 text-center bg-[#FFFFFF]">
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-[#F0F4F5]">
              <Users className="size-5 text-[#6E97A7]" />
            </div>
            <p className="text-2xl font-bold text-black">{staffCount}</p>
            <p className="text-sm text-[rgba(0,0,0,0.55)]">Staff members</p>
          </div>
          <div className="rounded-lg p-4 text-center bg-[#FFFFFF]">
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-[#F0F4F5]">
              <ShieldCheck className="size-5 text-[#6E97A7]" />
            </div>
            <p className="text-2xl font-bold text-black">{credentialCount}</p>
            <p className="text-sm text-[rgba(0,0,0,0.55)]">Credentials tracked</p>
          </div>
        </div>

        <ul className="space-y-2 text-sm text-[rgba(0,0,0,0.55)]">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#5B8A6A]" />
            <span>Email alerts for expiring credentials</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#5B8A6A]" />
            <span>Audit-ready compliance reports</span>
          </li>
        </ul>

        {planLabel ? (
          <div className="space-y-3">
            <Button type="button" onClick={handleSubscribe} className="w-full">
              <CreditCard className="mr-2 size-4" />
              Activate {planLabel} subscription
            </Button>
            <p className="text-center text-xs text-[rgba(0,0,0,0.45)]">
              You will be redirected to our payment partner to complete the subscription.
            </p>
          </div>
        ) : (
          <Button type="button" onClick={() => router.push("/dashboard")} className="w-full">
            Go to dashboard <ArrowRight className="ml-2 size-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
