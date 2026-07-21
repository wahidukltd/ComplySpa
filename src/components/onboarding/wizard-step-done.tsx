"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Users, ShieldCheck, ArrowRight } from "lucide-react";

export function WizardStepDone({
  staffCount,
  credentialCount,
}: {
  staffCount: number;
  credentialCount: number;
}) {
  const router = useRouter();

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full" style={{ backgroundColor: "#E8F2EB" }}>
          <CheckCircle2 className="size-6" style={{ color: "#4A8C5C" }} />
        </div>
        <CardTitle className="text-xl" style={{ color: "#3D2A25" }}>
          You&apos;re all set
        </CardTitle>
        <CardDescription style={{ color: "#8B7D78" }}>
          Your clinic is configured and ready to go. Here&apos;s what you set up:
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg p-4 text-center" style={{ backgroundColor: "#FFF8F2" }}>
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full" style={{ backgroundColor: "#F6E3D6" }}>
              <Users className="size-5" style={{ color: "#9C6B5D" }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: "#3D2A25" }}>{staffCount}</p>
            <p className="text-sm" style={{ color: "#8B7D78" }}>Staff members</p>
          </div>
          <div className="rounded-lg p-4 text-center" style={{ backgroundColor: "#FFF8F2" }}>
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full" style={{ backgroundColor: "#F6E3D6" }}>
              <ShieldCheck className="size-5" style={{ color: "#9C6B5D" }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: "#3D2A25" }}>{credentialCount}</p>
            <p className="text-sm" style={{ color: "#8B7D78" }}>Credentials tracked</p>
          </div>
        </div>

        <ul className="space-y-2 text-sm" style={{ color: "#8B7D78" }}>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "#4A8C5C" }} />
            <span>Email alerts for expiring credentials</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "#4A8C5C" }} />
            <span>Audit-ready compliance reports</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "#4A8C5C" }} />
            <span>Inspection readiness tracking</span>
          </li>
        </ul>

        <Button type="button" onClick={() => router.push("/dashboard")} className="w-full">
          Go to dashboard <ArrowRight className="ml-2 size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
