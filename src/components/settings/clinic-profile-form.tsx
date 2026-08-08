"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClinicProfile } from "@/lib/actions/settings";
import { clinicProfileSchema } from "@/lib/validations/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ClinicProfileFormProps {
  name: string;
  address: string | null;
  state: string | null;
  role: string;
}

type FieldName = "name" | "address" | "state";

export function ClinicProfileForm({ name, address, state, role }: ClinicProfileFormProps) {
  const router = useRouter();
  const isOwner = role === "owner";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  function applyFieldErrors(errors: Record<string, string[] | undefined>) {
    const next: Partial<Record<FieldName, string>> = {};
    for (const field of ["name", "address", "state"] as FieldName[]) {
      const messages = errors[field];
      if (messages && messages.length > 0) next[field] = messages.join(", ");
    }
    setFieldErrors(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const formData = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = clinicProfileSchema.safeParse(formData);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        (errors[field] ??= []).push(issue.message);
      }
      applyFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    const result = await updateClinicProfile(parsed.data);
    setIsSubmitting(false);

    if (result.error) {
      if (result.fieldErrors) {
        applyFieldErrors(result.fieldErrors);
      } else {
        toast.error(result.error);
      }
      return;
    }

    toast.success("Clinic profile updated");
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    router.refresh();
  }

  if (!isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#000000" }}>Clinic Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "rgba(0,0,0,0.55)" }}>Clinic name</p>
              <p className="text-sm" style={{ color: "#000000" }}>{name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "rgba(0,0,0,0.55)" }}>Address</p>
              <p className="text-sm" style={{ color: "#000000" }}>{address || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "rgba(0,0,0,0.55)" }}>State / Province</p>
              <p className="text-sm" style={{ color: "#000000" }}>{state || "—"}</p>
            </div>
          </div>
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
            Only the owner can edit clinic profile details.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: "#000000" }}>Clinic Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Clinic name</Label>
            <Input id="name" name="name" defaultValue={name} required aria-invalid={Boolean(fieldErrors.name)} />
            {fieldErrors.name && (
              <p className="text-sm" style={{ color: "#B8443A" }} role="alert">{fieldErrors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" defaultValue={address ?? ""} aria-invalid={Boolean(fieldErrors.address)} />
            {fieldErrors.address && (
              <p className="text-sm" style={{ color: "#B8443A" }} role="alert">{fieldErrors.address}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State / Province</Label>
            <Input id="state" name="state" maxLength={100} defaultValue={state ?? ""} aria-invalid={Boolean(fieldErrors.state)} />
            {fieldErrors.state && (
              <p className="text-sm" style={{ color: "#B8443A" }} role="alert">{fieldErrors.state}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save
            </Button>
            {savedAt && (
              <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#4A8C5C" }}>
                <CheckCircle2 className="size-4" />
                Saved {savedAt}
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
            These details appear on your compliance reports and billing pages.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
