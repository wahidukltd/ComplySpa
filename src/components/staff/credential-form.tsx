"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  credentialSchema,
  type CredentialInput,
} from "@/lib/validations/staff";
import { uploadDocument } from "@/lib/utils/upload";
import { Loader2, Upload } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import type { Tables } from "@/types/database";

type Credential = Tables<"credentials">;
type CredentialTypeOption = Pick<Tables<"credential_types">, "id" | "name" | "category">;

interface CredentialFormProps {
  staffMemberId: string;
  defaultValues?: Partial<Credential>;
  onSubmit: (data: CredentialInput & { document_url?: string }) => Promise<{ error?: string; fieldErrors?: Record<string, string[]> }>;
  submitLabel?: string;
}

export function CredentialForm({
  staffMemberId,
  defaultValues,
  onSubmit,
  submitLabel = "Save",
}: CredentialFormProps) {
  const [credentialTypes, setCredentialTypes] = useState<CredentialTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<CredentialInput>({
    resolver: zodResolver(credentialSchema),
    defaultValues: {
      staff_member_id: staffMemberId,
      credential_type_id: defaultValues?.credential_type_id ?? "",
      license_number: defaultValues?.license_number ?? "",
      state: defaultValues?.state ?? "",
      issue_date: defaultValues?.issue_date ?? "",
      expiration_date: defaultValues?.expiration_date ?? "",
      verification_url: defaultValues?.verification_url ?? "",
      notes: defaultValues?.notes ?? "",
    },
  });

  const [documentUrl, setDocumentUrl] = useState<string | null>(
    defaultValues?.document_url ?? null,
  );

  useEffect(() => {
    async function loadTypes() {
      const supabase = createClient();
      const { data: staff } = await supabase
        .from("staff_members")
        .select("clinic_id")
        .eq("id", staffMemberId)
        .single();
      if (!staff) {
        setTypesError("Staff member not found.");
        setTypesLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("credential_types")
        .select("id, name, category")
        .or(`clinic_id.is.null,clinic_id.eq.${staff.clinic_id}`)
        .order("name");
      if (error) {
        Sentry.captureException(error);
        setTypesError("Failed to load credential types. Please refresh.");
      } else {
        setCredentialTypes(data ?? []);
      }
      setTypesLoading(false);
    }
    loadTypes();
  }, [staffMemberId]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    const supabase = createClient();
    const { data: staff } = await supabase
      .from("staff_members")
      .select("clinic_id")
      .eq("id", staffMemberId)
      .single();

    if (!staff) {
      setUploadError("Staff member not found.");
      setUploading(false);
      return;
    }

    const { filePath, error } = await uploadDocument(file, staff.clinic_id);
    if (error) {
      setUploadError(error);
      setUploading(false);
      return;
    }

    setDocumentUrl(filePath);
    setUploading(false);
  }

  const grouped = credentialTypes.reduce<Record<string, CredentialTypeOption[]>>((acc, ct) => {
    const cat = ct.category || "other";
    (acc[cat] ??= []).push(ct);
    return acc;
  }, {});

  return (
    <form onSubmit={handleSubmit((data) => onSubmit({ ...data, document_url: documentUrl ?? undefined }))} className="space-y-6">
      <input type="hidden" {...register("staff_member_id")} />

      <div className="space-y-2">
        <Label htmlFor="credential_type_id">
          Credential type <span className="text-destructive">*</span>
        </Label>
        {typesLoading ? (
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        ) : typesError ? (
          <p className="text-sm text-destructive">{typesError}</p>
        ) : (
          <Select
            defaultValue={defaultValues?.credential_type_id ?? undefined}
            onValueChange={(value) => value && setValue("credential_type_id", value)}
          >
            <SelectTrigger id="credential_type_id">
              <SelectValue placeholder="Select a credential type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(grouped).map(([category, types]) => (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                    {category}
                  </div>
                  {types.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>
                      {ct.name}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.credential_type_id && (
          <p className="text-sm text-destructive">{errors.credential_type_id.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="license_number">License number</Label>
        <Input
          id="license_number"
          {...register("license_number")}
          placeholder="e.g. RN123456"
        />
        {errors.license_number && (
          <p className="text-sm text-destructive">{errors.license_number.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="state">State</Label>
        <Input
          id="state"
          {...register("state")}
          maxLength={100}
          placeholder="e.g. TX"
        />
        {errors.state && (
          <p className="text-sm text-destructive">{errors.state.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          For multi-state tracking, add multiple credentials of the same type — one per state.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="issue_date">Issue date</Label>
          <Input id="issue_date" type="date" {...register("issue_date")} />
          {errors.issue_date && (
            <p className="text-sm text-destructive">{errors.issue_date.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="expiration_date">Expiration date</Label>
          <Input id="expiration_date" type="date" {...register("expiration_date")} />
          {errors.expiration_date && (
            <p className="text-sm text-destructive">{errors.expiration_date.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="verification_url">Verification URL</Label>
        <Input
          id="verification_url"
          type="url"
          {...register("verification_url")}
          placeholder="https://www.example.gov/verify"
        />
        {errors.verification_url && (
          <p className="text-sm text-destructive">{errors.verification_url.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Link to the state board license lookup page for this credential.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Document</Label>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted">
            <Upload className="size-4" />
            {uploading ? "Uploading..." : "Upload file"}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
          {documentUrl && (
            <span className="text-sm text-muted-foreground">
              ✓ File uploaded
            </span>
          )}
        </div>
        {uploadError && (
          <p className="text-sm text-destructive">{uploadError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          JPG, PNG, WebP, or PDF. Max 10MB.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          {...register("notes")}
          placeholder="Any additional notes about this credential..."
          rows={2}
        />
        {errors.notes && (
          <p className="text-sm text-destructive">{errors.notes.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Saving...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
