"use client";

import { useState } from "react";
import { createClinic } from "@/lib/actions/onboarding";
import { createClinicSchema } from "@/lib/validations/clinic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";

export function OnboardingForm() {
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

    const result = await createClinic(input);
    if (result?.error) {
      setServerError(result.error);
      if (result.fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs && msgs.length > 0) flat[key] = msgs[0] ?? "";
        }
        setErrors(flat);
      }
    }
    setIsSubmitting(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <CardTitle className="text-xl">Set up your clinic</CardTitle>
          <CardDescription>
            Enter your clinic details to get started. You can update these later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Clinic name <span className="text-destructive">*</span>
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
                <p id="name-error" className="text-sm text-destructive">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address (optional)</Label>
              <Input
                id="address"
                name="address"
                placeholder="e.g. 123 Main St, Suite 200, Austin, TX 78701"
              />
              {errors.address && (
                <p className="text-sm text-destructive">{errors.address}</p>
              )}
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
                <p className="text-sm text-destructive">{errors.state}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {serverError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating clinic…
                </>
              ) : (
                "Create clinic"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
