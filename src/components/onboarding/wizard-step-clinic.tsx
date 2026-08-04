"use client";

import { useState } from "react";
import Link from "next/link";
import { createClinicOnboarding } from "@/lib/actions/onboarding";
import { createClinicSchema } from "@/lib/validations/clinic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2 } from "lucide-react";

export function WizardStepClinic({ onNext, plan }: { onNext: (clinicId: string) => void; plan?: string | null }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const planLabel = plan === "solo" ? "Solo" : plan === "practice" ? "Practice" : null;
  const trialPlan: "solo" | "practice" | undefined =
    plan === "solo" ? "solo" : plan === "practice" ? "practice" : undefined;

  if (!trialPlan) {
    // Direct /onboarding visits without a chosen plan get a recovery path
    // instead of a dead-end error (the gated sign-up normally prevents this).
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-[#F0F4F5]">
            <Building2 className="size-5 text-[#6E97A7]" />
          </div>
          <h3 className="text-lg font-semibold mb-2 text-black">Choose a plan to start your free trial</h3>
          <p className="text-sm mb-6 text-[rgba(0,0,0,0.55)]">
            Every trial evaluates a plan — Solo or Practice. Select one to continue setting up your clinic.
          </p>
          <Link
            href="/pricing?reason=select_plan"
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#6E97A7", color: "#FFFFFF" }}
          >
            View Plans
          </Link>
        </CardContent>
      </Card>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setServerError(null);
    setIsSubmitting(true);

    // Unreachable: the no-plan card above replaces the form when trialPlan is
    // missing. Guarded for the type system (closure typing can't see it).
    if (!trialPlan) return;

    const formData = new FormData(event.currentTarget);
    const input = {
      name: (formData.get("name") as string)?.trim() ?? "",
      address: (formData.get("address") as string)?.trim() ?? "",
      state: (formData.get("state") as string)?.trim().toUpperCase() ?? "",
      trialPlan,
    };

    const parsed = createClinicSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const flat: Record<string, string> = {};
      for (const [key, msgs] of Object.entries(fieldErrors)) {
        if (msgs && msgs.length > 0) flat[key] = msgs[0] ?? "";
      }
      setErrors(flat);
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await createClinicOnboarding(input);
      if (result.error) {
        setServerError(result.error);
        if (result.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(result.fieldErrors)) {
            if (msgs && Array.isArray(msgs) && msgs.length > 0) flat[key] = msgs[0] ?? "";
          }
          setErrors(flat);
        }
        setIsSubmitting(false);
        return;
      }

      if (result.clinicId) {
        onNext(result.clinicId);
      } else {
        setServerError("An unexpected error occurred. Please try again.");
        setIsSubmitting(false);
      }
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-[#F0F4F5]">
          <Building2 className="size-5 text-[#6E97A7]" />
        </div>
        <CardTitle className="text-xl text-black">Set up your clinic</CardTitle>
        <CardDescription className="text-[rgba(0,0,0,0.55)]">
          Enter your clinic details to get started.
        </CardDescription>
        {planLabel && (
          <p
            className="mx-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: "#F0F4F5", color: "#6E97A7" }}
          >
            Evaluating {planLabel} — 14-day free trial
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Clinic name <span className="text-[#B8443A]">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Radiant Aesthetics & Wellness"
              autoFocus
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-[#B8443A]">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address (optional)</Label>
            <Input
              id="address"
              name="address"
              placeholder="e.g. 123 Main St, Suite 200, Austin, TX 78701"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State (optional)</Label>
            <Input
              id="state"
              name="state"
              maxLength={2}
              placeholder="e.g. TX"
              className="w-20 uppercase"
            />
            {errors.state && (
              <p className="text-sm text-[#B8443A]">{errors.state}</p>
            )}
          </div>

          {serverError && (
            <div className="rounded-md p-3 text-sm bg-[#FCE8E5] text-[#7A2A26]">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating clinic...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
