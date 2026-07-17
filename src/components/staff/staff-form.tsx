"use client";

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
import { Loader2 } from "lucide-react";
import type { Tables } from "@/types/database";

type StaffMember = Tables<"staff_members">;

const ROLES = [
  { value: "RN", label: "Registered Nurse (RN)" },
  { value: "NP", label: "Nurse Practitioner (NP)" },
  { value: "PA", label: "Physician Assistant (PA)" },
  { value: "MD", label: "Medical Doctor (MD)" },
  { value: "DO", label: "Doctor of Osteopathic Medicine (DO)" },
  { value: "esthetician", label: "Esthetician" },
  { value: "MA", label: "Medical Assistant (MA)" },
  { value: "other", label: "Other" },
];

interface StaffFormProps {
  defaultValues?: Partial<StaffMember>;
  onSubmit: (data: StaffMemberInput) => Promise<{ error?: string; fieldErrors?: Record<string, string[]> }>;
  submitLabel?: string;
}

export function StaffForm({ defaultValues, onSubmit, submitLabel = "Save" }: StaffFormProps) {
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
      procedures_performed: defaultValues?.procedures_performed ?? [],
    },
  });

  const proceduresText = (useWatch({ control, name: "procedures_performed" }) ?? []).join(", ");

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
          defaultValue={defaultValues?.role ?? undefined}
          onValueChange={(value) => setValue("role", value as StaffMemberInput["role"])}
        >
          <SelectTrigger id="role">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="hire_date">Hire date</Label>
        <Input
          id="hire_date"
          type="date"
          {...register("hire_date")}
        />
        {errors.hire_date && (
          <p className="text-sm text-destructive">{errors.hire_date.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...register("email")}
          placeholder="jane@clinic.com"
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          {...register("phone")}
          placeholder="+1 (555) 000-0000"
        />
        {errors.phone && (
          <p className="text-sm text-destructive">{errors.phone.message}</p>
        )}
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
