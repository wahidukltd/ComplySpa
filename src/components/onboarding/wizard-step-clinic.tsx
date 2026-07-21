"use client";

import { useState } from "react";
import { createClinicOnboarding } from "@/lib/actions/onboarding";
import { createClinicSchema } from "@/lib/validations/clinic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2 } from "lucide-react";

export function WizardStepClinic({ onNext }: { onNext: (clinicId: string) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setServerError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const input = {
      name: (formData.get("name") as string)?.trim() ?? "",
      address: (formData.get("address") as string)?.trim() ?? "",
      state: (formData.get("state") as string)?.trim().toUpperCase() ?? "",
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
            if (msgs && msgs.length > 0) flat[key] = msgs[0] ?? "";
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
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full" style={{ backgroundColor: "#F6E3D6" }}>
          <Building2 className="size-5" style={{ color: "#9C6B5D" }} />
        </div>
        <CardTitle className="text-xl" style={{ color: "#3D2A25" }}>Set up your clinic</CardTitle>
        <CardDescription style={{ color: "#8B7D78" }}>
          Enter your clinic details to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Clinic name <span style={{ color: "#B8443A" }}>*</span>
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
              <p id="name-error" className="text-sm" style={{ color: "#B8443A" }}>{errors.name}</p>
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
              <p className="text-sm" style={{ color: "#B8443A" }}>{errors.state}</p>
            )}
          </div>

          {serverError && (
            <div className="rounded-md p-3 text-sm" style={{ backgroundColor: "#FCE8E5", color: "#7A2A26" }}>
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
