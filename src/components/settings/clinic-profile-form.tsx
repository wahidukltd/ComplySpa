"use client";

import { useState } from "react";
import { updateClinicProfile } from "@/lib/actions/settings";
import { clinicProfileSchema } from "@/lib/validations/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ClinicProfileFormProps {
  name: string;
  address: string | null;
  state: string | null;
}

export function ClinicProfileForm({ name, address, state }: ClinicProfileFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const formData = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = clinicProfileSchema.safeParse(formData);
    if (!parsed.success) {
      setIsSubmitting(false);
      toast.error(parsed.error.issues.map((e) => e.message).join(", "));
      return;
    }
    const result = await updateClinicProfile(parsed.data);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Clinic profile updated");
    }
    setIsSubmitting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: "#000000" }}>Clinic Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Clinic name</Label>
            <Input id="name" name="name" defaultValue={name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" defaultValue={address ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" name="state" maxLength={2} className="w-20 uppercase" defaultValue={state ?? ""} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
