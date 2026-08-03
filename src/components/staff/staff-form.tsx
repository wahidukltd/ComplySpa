"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  staffMemberSchema,
  type StaffMemberInput,
} from "@/lib/validations/staff";
import { ROLE_DISPLAY_LABELS, ROLE_VALUES } from "@/lib/staff/role-credential-defaults";
import { getRoleChangePreview } from "@/lib/actions/role-templates";
import { Loader2 } from "lucide-react";
import type { Tables } from "@/types/database";

type StaffMember = Tables<"staff_members">;

const ROLE_KEYS = ROLE_VALUES;

interface RoleChangePreview {
  kept: number;
  added: { name: string }[];
  removed: { name: string }[];
}

interface StaffFormProps {
  defaultValues?: Partial<StaffMember>;
  onSubmit: (data: StaffMemberInput) => Promise<{ error?: string; fieldErrors?: Record<string, string[]> }>;
  submitLabel?: string;
  /** Present on the edit form — enables the role-change preview (D12). */
  staffMemberId?: string;
}

export function StaffForm({ defaultValues, onSubmit, submitLabel = "Save", staffMemberId }: StaffFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    setError,
    control,
  } = useForm<StaffMemberInput>({
    resolver: zodResolver(staffMemberSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      role: (defaultValues?.role as StaffMemberInput["role"]) ?? undefined,
      hire_date: defaultValues?.hire_date ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      location: defaultValues?.location ?? "",
      department: defaultValues?.department ?? "",
      manager: defaultValues?.manager ?? "",
      procedures_performed: defaultValues?.procedures_performed ?? [],
    },
  });

  const proceduresText = (useWatch({ control, name: "procedures_performed" }) ?? []).join(", ");

  const originalRole = defaultValues?.role as StaffMemberInput["role"] | undefined;
  const currentRole = useWatch({ control, name: "role" });
  // Preview state is keyed by the role it was fetched for; the card renders
  // only when it matches the currently selected role, so a revert or a new
  // selection hides it instantly without a synchronous setState in the effect.
  const [preview, setPreview] = useState<{ role: string; data: RoleChangePreview } | null>(null);

  // D12: "no surprise after save" — when the role changes, state the outcome
  // (kept / added / removed) before the owner commits. Advisory only; the
  // post-save checklist is truth.
  useEffect(() => {
    let cancelled = false;
    if (!staffMemberId || !currentRole || currentRole === originalRole) return;
    getRoleChangePreview(staffMemberId, currentRole).then((result) => {
      if (!cancelled && !result.error && result.data) {
        setPreview({ role: currentRole, data: result.data });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [staffMemberId, currentRole, originalRole]);

  const previewData =
    preview && preview.role === currentRole && currentRole !== originalRole ? preview.data : null;

  const roleSelectItems = useMemo(
    () => ROLE_KEYS.map((key) => ({ value: key, label: ROLE_DISPLAY_LABELS[key] ?? key })),
    [],
  );

  async function onFormSubmit(data: StaffMemberInput) {
    const result = await onSubmit(data);
    if (result?.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof StaffMemberInput, { message: messages.join(", ") });
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">
          Full name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          {...register("name")}
          placeholder="e.g. Jane Smith, RN"
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select
          defaultValue={originalRole}
          onValueChange={(value) => setValue("role", value as StaffMemberInput["role"])}
          items={roleSelectItems}
        >
          <SelectTrigger id="role">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {ROLE_DISPLAY_LABELS[key] ?? key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.role && (
          <p className="text-sm text-destructive">{errors.role.message}</p>
        )}
      </div>

      {previewData && currentRole && (
        <div
          aria-live="polite"
          className="rounded-lg border border-muted-foreground/20 bg-muted/20 px-4 py-3 text-sm"
        >
          <p className="font-medium">
            Changing role to {ROLE_DISPLAY_LABELS[currentRole] ?? currentRole}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Requirements will update when you save:</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            <li>
              <span className="text-[#4A8C5C]">✓</span> {previewData.kept} kept — completed progress is preserved
            </li>
            {previewData.added.length > 0 && (
              <li>
                <span className="text-primary">+</span> {previewData.added.length} added (
                {previewData.added.map((a) => a.name).join(", ")})
              </li>
            )}
            {previewData.removed.length > 0 && (
              <li>
                <span className="text-destructive">–</span> {previewData.removed.length} removed (
                {previewData.removed.map((r) => r.name).join(", ")})
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Nothing is reset. Completed requirements stay complete.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hire_date">Hire date</Label>
          <Input id="hire_date" type="date" {...register("hire_date")} />
          {errors.hire_date && (
            <p className="text-sm text-destructive">{errors.hire_date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" {...register("location")} placeholder="e.g. Main Street Clinic" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Input id="department" {...register("department")} placeholder="e.g. Injectables" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" {...register("phone")} placeholder="+1 (555) 000-0000" />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} placeholder="jane@clinic.com" />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="manager">Manager</Label>
          <Input id="manager" {...register("manager")} placeholder="e.g. Dr. Smith" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="procedures">
          Procedures performed
          <span className="ml-1 text-xs text-muted-foreground">
            (comma-separated)
          </span>
        </Label>
        <Textarea
          id="procedures"
          value={proceduresText}
          onChange={(e) => {
            const arr = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            setValue("procedures_performed", arr);
          }}
          placeholder="e.g. Botox injections, Dermal fillers, Laser hair removal"
          rows={2}
        />
        {errors.procedures_performed && (
          <p className="text-sm text-destructive">{errors.procedures_performed.message}</p>
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
