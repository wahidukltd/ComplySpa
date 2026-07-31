"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Stethoscope,
  UserCheck,
  Heart,
  HeartPulse,
  Sparkles,
  Bandage,
  Building2,
  CircleDot,
  Loader2,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { addStaffMemberWithCredentials } from "@/lib/actions/staff";
import {
  ROLE_DISPLAY_LABELS,
  ROLE_CARD_ORDER,
} from "@/lib/staff/role-credential-defaults";
import type { Tables } from "@/types/database";

type CredentialTypeOption = Pick<Tables<"credential_types">, "id" | "name" | "category">;

interface WizardCredential {
  credential_type_id: string;
  credential_type_name: string;
  category: string;
  checked: boolean;
  license_number: string;
  state: string;
  issue_date: string;
  expiration_date: string;
}

const ROLE_ICONS: Record<string, typeof Stethoscope> = {
  MD: Stethoscope,
  DO: Stethoscope,
  NP: UserCheck,
  PA: HeartPulse,
  RN: Heart,
  esthetician: Sparkles,
  MA: Bandage,
  front_desk: Building2,
  other: CircleDot,
};

export function StaffWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [credentialTypes, setCredentialTypes] = useState<CredentialTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [wizardCredentials, setWizardCredentials] = useState<WizardCredential[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);

  const {
    register,
    formState: { errors },
    getValues,
  } = useForm({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      location: "",
      department: "",
      hire_date: "",
      manager: "",
    },
  });

  useEffect(() => {
    async function loadTypes() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: userRecord } = await supabase
        .from("users")
        .select("clinic_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!userRecord) return;
      setClinicId(userRecord.clinic_id);

      const { data, error } = await supabase
        .from("credential_types")
        .select("id, name, category")
        .or(`clinic_id.is.null,clinic_id.eq.${userRecord.clinic_id}`)
        .order("name");

      if (error) {
        toast.error("Failed to load credential types.");
      } else {
        setCredentialTypes(data ?? []);
      }
      setTypesLoading(false);
    }
    loadTypes();
  }, []);

  const typeIdToInfo = useMemo(() => {
    const map: Record<string, CredentialTypeOption> = {};
    for (const ct of credentialTypes) {
      map[ct.id] = ct;
    }
    return map;
  }, [credentialTypes]);

  const availableTypes = useMemo(
    () => credentialTypes.filter((ct) => !wizardCredentials.some((wc) => wc.credential_type_id === ct.id)),
    [credentialTypes, wizardCredentials],
  );

  async function handleRoleSelect(role: string) {
    setSelectedRole(role);
    setStep2Error(null);

    if (!clinicId) {
      setWizardCredentials([]);
      return;
    }

    const supabase = createClient();

    let { data: template } = await supabase
      .from("role_templates")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("role", role)
      .eq("is_active", true)
      .maybeSingle();

    if (!template) {
      const { data: globalTemplate } = await supabase
        .from("role_templates")
        .select("id")
        .is("clinic_id", null)
        .eq("role", role)
        .eq("is_active", true)
        .maybeSingle();
      template = globalTemplate;
    }

    if (!template) {
      setWizardCredentials([]);
      return;
    }

    const { data: items } = await supabase
      .from("role_template_items")
      .select(`
        credential_type_id,
        is_required,
        credential_type:credential_types!role_template_items_credential_type_id_fkey(name, category)
      `)
      .eq("template_id", template.id)
      .order("sort_order");

    const newCreds: WizardCredential[] = (items ?? []).map((item) => ({
      credential_type_id: item.credential_type_id,
      credential_type_name: item.credential_type?.name ?? "Unknown",
      category: item.credential_type?.category ?? "other",
      checked: item.is_required,
      license_number: "",
      state: "",
      issue_date: "",
      expiration_date: "",
    }));

    setWizardCredentials(newCreds);
  }

  function toggleCredential(id: string) {
    setWizardCredentials((prev) =>
      prev.map((c) => (c.credential_type_id === id ? { ...c, checked: !c.checked } : c)),
    );
  }

  function updateCredentialField(id: string, field: keyof WizardCredential, value: string) {
    setWizardCredentials((prev) =>
      prev.map((c) => (c.credential_type_id === id ? { ...c, [field]: value } : c)),
    );
  }

  function addCredential() {
    const firstAvailable = availableTypes[0];
    if (!firstAvailable) return;
    setWizardCredentials((prev) => [
      ...prev,
      {
        credential_type_id: firstAvailable.id,
        credential_type_name: firstAvailable.name,
        category: firstAvailable.category ?? "other",
        checked: true,
        license_number: "",
        state: "",
        issue_date: "",
        expiration_date: "",
      },
    ]);
  }

  function removeCredential(id: string) {
    setWizardCredentials((prev) => prev.filter((c) => c.credential_type_id !== id));
  }

  function handleCredentialTypeChange(index: number, typeId: string) {
    const info = typeIdToInfo[typeId];
    if (!info) return;
    setWizardCredentials((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, credential_type_id: typeId, credential_type_name: info.name, category: info.category ?? "other" }
          : c,
      ),
    );
  }

  async function onSubmit() {
    const values = getValues();
    if (!values.name?.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!selectedRole) {
      toast.error("Please select a role.");
      return;
    }

    setSubmitting(true);
    const checkedCredentials = wizardCredentials
      .filter((c) => c.checked)
      .map((c) => ({
        credential_type_id: c.credential_type_id,
        license_number: c.license_number || "",
        state: c.state || "",
        issue_date: c.issue_date || "",
        expiration_date: c.expiration_date || "",
      }));

    const result = await addStaffMemberWithCredentials({
      name: values.name,
      email: values.email || "",
      phone: values.phone || "",
      location: values.location || "",
      department: values.department || "",
      hire_date: values.hire_date || "",
      manager: values.manager || "",
      role: (selectedRole ?? undefined) as "RN" | "NP" | "PA" | "MD" | "DO" | "esthetician" | "MA" | "front_desk" | "other" | undefined,
      procedures_performed: [],
      credentials: checkedCredentials,
    });

    setSubmitting(false);

    if (result.success && result.id) {
      toast.success("Staff member added successfully.");
      router.push(`/dashboard/staff/${result.id}`);
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  function renderStepIndicator() {
    const steps = [
      { num: 1, label: "Basic Info" },
      { num: 2, label: "Role" },
      { num: 3, label: "Review" },
    ];
    return (
      <div className="mb-8 flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                step > s.num
                  ? "bg-primary text-primary-foreground"
                  : step === s.num
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s.num ? <Check className="size-4" /> : s.num}
            </div>
            <span className={`text-sm ${step === s.num ? "font-medium" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>
    );
  }

  function renderStep1() {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Basic Information</h2>
          <p className="text-sm text-muted-foreground">Start by telling us about the new staff member.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wiz-name">
            Full name <span className="text-destructive">*</span>
          </Label>
          <Input id="wiz-name" {...register("name")} placeholder="e.g. Jane Smith" />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wiz-email">Email</Label>
            <Input id="wiz-email" type="email" {...register("email")} placeholder="jane@clinic.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiz-phone">Phone</Label>
            <Input id="wiz-phone" type="tel" {...register("phone")} placeholder="+1 (555) 000-0000" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wiz-location">Location</Label>
            <Input id="wiz-location" {...register("location")} placeholder="e.g. Main Street Clinic" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiz-department">Department</Label>
            <Input id="wiz-department" {...register("department")} placeholder="e.g. Injectables" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wiz-start-date">Start date</Label>
            <Input id="wiz-start-date" type="date" {...register("hire_date")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiz-manager">Manager</Label>
            <Input id="wiz-manager" {...register("manager")} placeholder="e.g. Dr. Smith" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/staff")}>
            Cancel
          </Button>
          <Button onClick={() => setStep(2)} disabled={!getValues("name")?.trim()}>
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Choose Role</h2>
          <p className="text-sm text-muted-foreground">
            Pick the role that best describes this staff member. The system will automatically suggest the right credentials.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_CARD_ORDER.map((roleKey) => {
            const Icon = ROLE_ICONS[roleKey] ?? CircleDot;
            const label = ROLE_DISPLAY_LABELS[roleKey] ?? roleKey;
            const isSelected = selectedRole === roleKey;
            return (
              <button
                key={roleKey}
                type="button"
                onClick={() => handleRoleSelect(roleKey)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <Icon className={`size-8 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-sm font-medium ${isSelected ? "text-primary" : ""}`}>{label}</span>
                {roleKey === "MD" && (
                  <span className="text-xs text-muted-foreground">Covers MD & DO</span>
                )}
              </button>
            );
          })}
        </div>

        {step2Error && <p className="text-sm text-destructive">{step2Error}</p>}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(1)}>
            <ChevronLeft className="mr-1 size-4" />
            Back
          </Button>
          <Button onClick={() => setStep(3)} disabled={!selectedRole}>
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Review & Credentials</h2>
          <p className="text-sm text-muted-foreground">
            Review the staff member details and configure their credentials. Auto-loaded credentials for{" "}
            <span className="font-medium">{selectedRole ? ROLE_DISPLAY_LABELS[selectedRole] ?? selectedRole : ""}</span>{" "}
            are pre-selected.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{getValues("name")}</p>
            </div>
            {getValues("email") && (
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p>{getValues("email")}</p>
              </div>
            )}
            {getValues("location") && (
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p>{getValues("location")}</p>
              </div>
            )}
            {getValues("department") && (
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p>{getValues("department")}</p>
              </div>
            )}
            {getValues("manager") && (
              <div>
                <p className="text-xs text-muted-foreground">Manager</p>
                <p>{getValues("manager")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Credentials ({wizardCredentials.filter((c) => c.checked).length} selected)</h3>
            {availableTypes.length > 0 && (
              <Button variant="outline" size="sm" onClick={addCredential} className="gap-1">
                <Plus className="size-3.5" />
                Add credential
              </Button>
            )}
          </div>

          {typesLoading ? (
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
          ) : wizardCredentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No credentials configured for this role. You can save and add credentials later.
            </p>
          ) : (
            <div className="space-y-2">
              {wizardCredentials.map((cred, index) => (
                <Card key={cred.credential_type_id + index} className={cred.checked ? "" : "opacity-50"}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={cred.checked}
                          onChange={() => toggleCredential(cred.credential_type_id)}
                          className="mt-1 size-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{cred.credential_type_name}</p>
                            <Badge variant="outline" className="text-xs">
                              {cred.category}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => removeCredential(cred.credential_type_id)}
                        aria-label="Remove credential"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>

                    {cred.checked && (
                      <div className="ml-7 mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Select
                            value={cred.credential_type_id}
                            onValueChange={(v) => v && handleCredentialTypeChange(index, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {credentialTypes.map((ct) => (
                                <SelectItem key={ct.id} value={ct.id}>
                                  {ct.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Input
                            placeholder="License #"
                            className="h-8 text-xs"
                            value={cred.license_number}
                            onChange={(e) => updateCredentialField(cred.credential_type_id, "license_number", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Input
                            placeholder="State"
                            className="h-8 text-xs"
                            value={cred.state}
                            onChange={(e) => updateCredentialField(cred.credential_type_id, "state", e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Input
                              type="date"
                              className="h-8 text-xs"
                              value={cred.issue_date}
                              onChange={(e) => updateCredentialField(cred.credential_type_id, "issue_date", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Input
                              type="date"
                              className="h-8 text-xs"
                              value={cred.expiration_date}
                              onChange={(e) => updateCredentialField(cred.credential_type_id, "expiration_date", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(2)}>
            <ChevronLeft className="mr-1 size-4" />
            Back
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save staff member"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {renderStepIndicator()}

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </div>
  );
}
