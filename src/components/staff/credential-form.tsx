"use client";

import { useState, useEffect, useMemo } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  credentialSchema,
  type CredentialInput,
} from "@/lib/validations/staff";
import { uploadDocument } from "@/lib/utils/upload";
import { addCustomCredentialType } from "@/lib/actions/credential-types";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import type { Tables } from "@/types/database";

type Credential = Tables<"credentials">;
type CredentialTypeOption = Pick<Tables<"credential_types">, "id" | "name" | "category" | "default_renewal_cycle_days">;

const ADD_CUSTOM_VALUE = "__add_custom__";

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
  const [selectedTypeId, setSelectedTypeId] = useState<string | undefined>(defaultValues?.credential_type_id ?? undefined);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("training");
  const [customRenewal, setCustomRenewal] = useState("");
  const [customSaving, setCustomSaving] = useState(false);
  const [expirationEdited, setExpirationEdited] = useState(false);

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
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: staff } = await supabase
        .from("staff_members")
        .select("clinic_id")
        .eq("id", staffMemberId)
        .single();
      if (!staff) {
        if (!cancelled) setTypesError("Staff member not found.");
        if (!cancelled) setTypesLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("credential_types")
        .select("id, name, category, default_renewal_cycle_days")
        .or(`clinic_id.is.null,clinic_id.eq.${staff.clinic_id}`)
        .order("name");
      if (error) {
        Sentry.captureException(error);
        if (!cancelled) setTypesError("Failed to load credential types. Please refresh.");
      } else if (!cancelled) {
        setCredentialTypes(data ?? []);
      }
      if (!cancelled) setTypesLoading(false);
    })();
    return () => { cancelled = true; };
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

  const selectItems = useMemo(
    () => [
      ...credentialTypes.map((ct) => ({ value: ct.id, label: ct.name })),
      { value: ADD_CUSTOM_VALUE, label: "Add custom type" },
    ],
    [credentialTypes],
  );

  const selectedType = credentialTypes.find((t) => t.id === selectedTypeId);

  useEffect(() => {
    if (selectedType && selectedType.default_renewal_cycle_days && !defaultValues?.expiration_date && !expirationEdited) {
      const calculated = new Date(Date.now() + selectedType.default_renewal_cycle_days * 86400000)
        .toISOString().split("T")[0];
      if (calculated) {
        setValue("expiration_date", calculated);
      }
    }
  }, [selectedType, defaultValues?.expiration_date, expirationEdited, setValue]);

  const handleTypeChange = (value: string | null) => {
    if (!value) return;
    if (value === ADD_CUSTOM_VALUE) {
      setCustomName("");
      setCustomCategory("training");
      setCustomRenewal("");
      setDialogOpen(true);
      return;
    }
    setSelectedTypeId(value);
    setValue("credential_type_id", value);
  };

  async function handleCreateCustom() {
    if (!customName.trim()) {
      toast.error("Name is required.");
      return;
    }
    setCustomSaving(true);
    const result = await addCustomCredentialType({
      name: customName.trim(),
      category: customCategory,
      renewal_days: customRenewal ? parseInt(customRenewal, 10) : undefined,
    });
    setCustomSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data) {
      setCredentialTypes((prev) => {
        const exists = prev.some((t) => t.id === result.data!.id);
        if (exists) return prev;
        return [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedTypeId(result.data.id);
      setValue("credential_type_id", result.data.id);
      toast.success(`"${result.data.name}" created`);
    }

    setDialogOpen(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit((data) => onSubmit({ ...data, document_url: documentUrl ?? undefined }))} className="space-y-6">
        <input type="hidden" {...register("credential_type_id")} />

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
              value={selectedTypeId}
              onValueChange={handleTypeChange}
              items={selectItems}
            >
              <SelectTrigger id="credential_type_id">
                <SelectValue placeholder="Select a credential type" />
              </SelectTrigger>
              <SelectContent>
                {credentialTypes.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>
                    {ct.name}
                  </SelectItem>
                ))}
                <div className="border-t border-border my-1" />
                <SelectItem value={ADD_CUSTOM_VALUE}>
                  Add custom type
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          {errors.credential_type_id && (
            <p className="text-sm text-destructive">{errors.credential_type_id.message}</p>
          )}
          {selectedType && (
            <p className="text-xs text-muted-foreground">
              Category: <span className="font-medium">{selectedType.category}</span>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="license_number">Number / ID</Label>
          <Input
            id="license_number"
            {...register("license_number")}
            placeholder="e.g. RN123456, policy number, contract ID"
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
            <Input id="expiration_date" type="date" {...register("expiration_date")} onChange={(e) => {
              setExpirationEdited(true);
              register("expiration_date").onChange(e);
            }} />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add custom credential type</DialogTitle>
            <DialogDescription>
              Create a new credential type for your clinic. It will only be visible to your clinic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="custom-name">Name</Label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Radiofrequency Microneedling Cert"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-category">Category</Label>
              <Select value={customCategory} onValueChange={(v) => v && setCustomCategory(v)}>
                <SelectTrigger id="custom-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="license">License</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="agreement">Agreement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-renewal">Renewal cycle (days, optional)</Label>
              <Input
                id="custom-renewal"
                type="number"
                value={customRenewal}
                onChange={(e) => setCustomRenewal(e.target.value)}
                placeholder="e.g. 365"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustom} disabled={customSaving}>
              {customSaving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create type"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
