"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";
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
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  addStaffMemberWithCredentials,
  getStaffWizardData,
} from "@/lib/actions/staff";
import {
  staffStep1Schema,
  type StaffStep1Values,
} from "@/lib/validations/staff";
import {
  ROLE_CARD_ORDER,
  ROLE_DISPLAY_LABELS,
} from "@/lib/staff/role-credential-defaults";
import { formatRoleLabel } from "@/lib/utils/roles";
import {
  buildSuggestedRows,
  autoExpirationDate,
  rowDateError,
  type WizardCredentialRow,
  type WizardCredentialType,
} from "@/lib/staff/wizard";
import { WizardAddCredentialDialog } from "./wizard-add-credential-dialog";

// MD and DO merge into one "Physician" card with an explicit MD/DO sub-choice
// (distinct role values — medical director = first MD/DO — with identical 041
// template item sets). `other` is excluded from the add flow: its template
// row has ZERO items (041 seed), so a hire would be instantly green "Work
// Ready" (readiness.ts:116 — zero-required template) with zero credentials
// and an empty checklist — a false compliance claim. Clinic custom roles
// (always a real template row, 057) cover "none of the above".
const PHYSICIAN_GROUP = "__physician__";
const PHYSICIAN_CHOICES = ["MD", "DO"] as const;
const BUILT_IN_CARD_ROLES = ROLE_CARD_ORDER.filter(
  (role) => role !== "MD" && role !== "DO" && role !== "other",
);

const STEP1_FIELDS = [
  "name",
  "email",
  "phone",
  "location",
  "department",
  "hire_date",
  "manager",
] as const;
type Step1Field = (typeof STEP1_FIELDS)[number];

const ROLE_ICONS: Record<string, typeof Stethoscope> = {
  NP: UserCheck,
  PA: HeartPulse,
  RN: Heart,
  esthetician: Sparkles,
  MA: Bandage,
  front_desk: Building2,
};

export function StaffWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [roleGroup, setRoleGroup] = useState<string | null>(null);
  const [wizardData, setWizardData] = useState<{
    types: WizardCredentialType[];
    customRoles: string[];
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [roleLoading, setRoleLoading] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [wizardCredentials, setWizardCredentials] = useState<WizardCredentialRow[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    control,
    formState: { errors },
    getValues,
    setError,
    trigger,
  } = useForm<StaffStep1Values>({
    resolver: zodResolver(staffStep1Schema),
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

  // Repo lesson 2026-08-09: `getValues` is non-reactive — a `disabled` bound
  // to it never re-evaluates. useWatch is reactive and must be called at the
  // component top level (rules of hooks — renderStep1 is a nested function).
  const watchedName = useWatch({ control, name: "name" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      setWizardData(null);
      try {
        const { data, error } = await getStaffWizardData(null);
        if (cancelled) return;
        if (error || !data) {
          setLoadError(error ?? "Failed to load wizard data.");
          return;
        }
        setWizardData({ types: data.types, customRoles: data.customRoles });
      } catch {
        // A rejected transport must surface like a returned error — never an
        // infinite skeleton with no Retry (final-review M-1).
        if (!cancelled) setLoadError("Failed to load wizard data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const typeById = useMemo(() => {
    const map = new Map<string, WizardCredentialType>();
    for (const t of wizardData?.types ?? []) map.set(t.id, t);
    return map;
  }, [wizardData]);

  const dataReady = wizardData !== null && loadError === null;

  // Race-freedom by construction (plan amendment 2026-08-09): every role
  // control is disabled while a load is in flight, so only one load can ever
  // run — a stale completion can never overwrite a newer selection. (The
  // monotonic-token ref pattern was abandoned: eslint-config-next's
  // react-hooks/refs forbids ref access in component-body functions, and a
  // disabled control makes the race unreachable instead of handled.)
  async function loadSuggestions(role: string) {
    setRoleLoading(true);
    setStep2Error(null);
    try {
      const { data, error } = await getStaffWizardData(role);
      if (error || !data) {
        // Honest failure: no stale rows, no silent empty list — Next stays
        // blocked until the retry succeeds.
        setWizardCredentials([]);
        setStep2Error(error ?? "Failed to load credentials for this role.");
        return;
      }
      setWizardCredentials(buildSuggestedRows(data.suggestions));
    } catch {
      // A rejected transport must not leave the role controls permanently
      // disabled (final-review M-1) — the same honest error path as a
      // returned error, with roleLoading always cleared.
      setWizardCredentials([]);
      setStep2Error("Failed to load credentials for this role.");
    } finally {
      setRoleLoading(false);
    }
  }

  function handleRoleSelect(role: string) {
    setRoleGroup(null);
    setSelectedRole(role);
    void loadSuggestions(role);
  }

  function handlePhysicianCard() {
    setRoleGroup(PHYSICIAN_GROUP);
    if (selectedRole && selectedRole !== "MD" && selectedRole !== "DO") {
      // Role-change intent: clear the previous role's selection and rows.
      setSelectedRole(null);
      setWizardCredentials([]);
      setStep2Error(null);
    }
  }

  function handlePhysicianChoice(choice: (typeof PHYSICIAN_CHOICES)[number]) {
    setRoleGroup(null);
    if (selectedRole === choice) return;
    setSelectedRole(choice);
    void loadSuggestions(choice);
  }

  function toggleCredential(credentialTypeId: string) {
    setWizardCredentials((prev) =>
      prev.map((c) => {
        if (c.credentialTypeId !== credentialTypeId) return c;
        const checked = !c.checked;
        // One-shot auto-expiration (matches credential-form): fill only when
        // turning ON, the field is still empty, and the type has a cycle.
        const type = typeById.get(c.credentialTypeId);
        const expirationDate =
          checked && !c.expirationDate && type?.defaultRenewalCycleDays
            ? autoExpirationDate(type.defaultRenewalCycleDays)
            : c.expirationDate;
        return { ...c, checked, expirationDate };
      }),
    );
  }

  function clearRowError(credentialTypeId: string) {
    setRowErrors((prev) => {
      if (!(credentialTypeId in prev)) return prev;
      const next = { ...prev };
      delete next[credentialTypeId];
      return next;
    });
  }

  function updateCredentialField(
    credentialTypeId: string,
    field: "licenseNumber" | "state" | "issueDate" | "expirationDate",
    value: string,
  ) {
    clearRowError(credentialTypeId);
    setWizardCredentials((prev) =>
      prev.map((c) =>
        c.credentialTypeId === credentialTypeId ? { ...c, [field]: value } : c,
      ),
    );
  }

  function handleAddCredential(typeId: string) {
    const type = typeById.get(typeId);
    if (!type) return;
    setWizardCredentials((prev) => [
      ...prev,
      {
        credentialTypeId: type.id,
        name: type.name,
        category: type.category,
        isRequired: false,
        fromTemplate: false,
        checked: true,
        licenseNumber: "",
        state: "",
        issueDate: "",
        expirationDate: type.defaultRenewalCycleDays
          ? autoExpirationDate(type.defaultRenewalCycleDays)
          : "",
      },
    ]);
    setAddDialogOpen(false);
  }

  function removeCredential(credentialTypeId: string) {
    setWizardCredentials((prev) =>
      prev.filter((c) => c.credentialTypeId !== credentialTypeId),
    );
    clearRowError(credentialTypeId);
  }

  function handleRowTypeChange(credentialTypeId: string, nextTypeId: string) {
    const info = typeById.get(nextTypeId);
    if (!info) return;
    clearRowError(credentialTypeId);
    setWizardCredentials((prev) =>
      prev.map((c) =>
        c.credentialTypeId === credentialTypeId
          ? {
              ...c,
              credentialTypeId: info.id,
              name: info.name,
              category: info.category,
              expirationDate:
                c.expirationDate ||
                (info.defaultRenewalCycleDays
                  ? autoExpirationDate(info.defaultRenewalCycleDays)
                  : ""),
            }
          : c,
      ),
    );
  }

  // Type options for an ADDED row's type select: every type except ones
  // already chosen by another row (the row's own current type stays
  // selectable) — duplicate credential types stay impossible (D7/D13c).
  function rowTypeOptions(currentTypeId: string) {
    return (wizardData?.types ?? []).filter(
      (t) =>
        t.id === currentTypeId ||
        !wizardCredentials.some((c) => c.credentialTypeId === t.id),
    );
  }

  function availableTypes() {
    return (wizardData?.types ?? []).filter(
      (t) => !wizardCredentials.some((c) => c.credentialTypeId === t.id),
    );
  }

  async function handleStep1Next() {
    const ok = await trigger();
    if (!ok) return;
    setStep(2);
  }

  async function onSubmit() {
    if (submitting) return;

    // Re-validate Basic Info on save: server field errors must never land on
    // an invisible step (the old flow set step-1 errors while the user stood
    // on step 3 — zero feedback).
    const step1Ok = await trigger();
    if (!step1Ok) {
      setStep(1);
      toast.error("Please fix the highlighted fields in Basic Info.");
      return;
    }
    if (!selectedRole) {
      toast.error("Please select a role.");
      return;
    }

    const invalidRows = wizardCredentials.filter(
      (c) => c.checked && rowDateError(c.issueDate, c.expirationDate) !== null,
    );
    if (invalidRows.length > 0) {
      const nextErrors: Record<string, string> = {};
      for (const c of invalidRows) {
        nextErrors[c.credentialTypeId] = rowDateError(c.issueDate, c.expirationDate)!;
      }
      setRowErrors(nextErrors);
      toast.error("Fix the credential dates before saving.");
      return;
    }
    setRowErrors({});

    const values = getValues();
    const checkedCredentials = wizardCredentials
      .filter((c) => c.checked)
      .map((c) => ({
        credential_type_id: c.credentialTypeId,
        license_number: c.licenseNumber,
        state: c.state,
        issue_date: c.issueDate,
        expiration_date: c.expirationDate,
      }));

    setSubmitting(true);
    const result = await addStaffMemberWithCredentials({
      name: values.name,
      email: values.email || "",
      phone: values.phone || "",
      location: values.location || "",
      department: values.department || "",
      hire_date: values.hire_date || "",
      manager: values.manager || "",
      role: selectedRole,
      procedures_performed: [],
      credentials: checkedCredentials,
    });
    setSubmitting(false);

    if (result.success && result.id) {
      toast.success("Staff member added.");
      router.push(`/dashboard/staff/${result.id}`);
      return;
    }

    if (result.fieldErrors) {
      // Step-1 field errors navigate back to step 1 with inline messages;
      // everything else (credentials array, role) is a toast on the current
      // step — nothing is silently dropped.
      let step1Errors = false;
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        if ((STEP1_FIELDS as readonly string[]).includes(field)) {
          setError(field as Step1Field, { message: messages.join(", ") });
          step1Errors = true;
        } else {
          toast.error(messages.join(", "));
        }
      }
      if (step1Errors) {
        setStep(1);
        toast.error("Please fix the highlighted fields in Basic Info.");
      }
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  function renderStepIndicator() {
    const steps = [
      { num: 1, label: "Basic Info" },
      { num: 2, label: "Role" },
      { num: 3, label: "Credentials" },
    ];
    return (
      <div className="mb-8 flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                step >= s.num
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
          <p className="text-sm text-muted-foreground">
            Start with the essentials — you can refine details later.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wiz-name">
            Full name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wiz-name"
            placeholder="e.g. Jane Smith"
            maxLength={255}
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wiz-email">Email</Label>
            <Input
              id="wiz-email"
              type="email"
              placeholder="jane@clinic.com"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiz-phone">Phone</Label>
            <Input
              id="wiz-phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              maxLength={30}
              aria-invalid={!!errors.phone}
              {...register("phone")}
            />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wiz-location">Location</Label>
            <Input
              id="wiz-location"
              placeholder="e.g. Main Street Clinic"
              maxLength={255}
              aria-invalid={!!errors.location}
              {...register("location")}
            />
            {errors.location && (
              <p className="text-sm text-destructive">{errors.location.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiz-department">Department</Label>
            <Input
              id="wiz-department"
              placeholder="e.g. Injectables"
              maxLength={255}
              aria-invalid={!!errors.department}
              {...register("department")}
            />
            {errors.department && (
              <p className="text-sm text-destructive">{errors.department.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wiz-start-date">Start date</Label>
            <Input id="wiz-start-date" type="date" {...register("hire_date")} />
            {errors.hire_date && (
              <p className="text-sm text-destructive">{errors.hire_date.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiz-manager">Manager</Label>
            <Input
              id="wiz-manager"
              placeholder="e.g. Dr. Smith"
              maxLength={255}
              aria-invalid={!!errors.manager}
              {...register("manager")}
            />
            {errors.manager && <p className="text-sm text-destructive">{errors.manager.message}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/staff")}>
            Cancel
          </Button>
          <Button onClick={handleStep1Next} disabled={!watchedName?.trim()}>
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    );
  }

  function renderStep2() {
    const isPhysicianActive =
      selectedRole === "MD" || selectedRole === "DO" || roleGroup === PHYSICIAN_GROUP;

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Choose a role</h2>
          <p className="text-sm text-muted-foreground">
            Credentials are suggested from each role&apos;s template — you can adjust them next.
          </p>
        </div>

        {loadError ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadToken((t) => t + 1)}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Retry
            </Button>
          </div>
        ) : !dataReady ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={handlePhysicianCard}
              disabled={roleLoading}
              aria-pressed={isPhysicianActive}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${
                isPhysicianActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <Stethoscope
                className={`size-8 ${isPhysicianActive ? "text-primary" : "text-muted-foreground"}`}
              />
              <span className={`text-sm font-medium ${isPhysicianActive ? "text-primary" : ""}`}>
                Physician
              </span>
              <span className="text-xs text-muted-foreground">Covers MD &amp; DO</span>
            </button>

            {BUILT_IN_CARD_ROLES.map((roleKey) => {
              const Icon = ROLE_ICONS[roleKey] ?? CircleDot;
              const label = ROLE_DISPLAY_LABELS[roleKey] ?? roleKey;
              const isSelected = selectedRole === roleKey;
              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => handleRoleSelect(roleKey)}
                  disabled={roleLoading}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <Icon
                    className={`size-8 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <span className={`text-sm font-medium ${isSelected ? "text-primary" : ""}`}>
                    {label}
                  </span>
                </button>
              );
            })}

            {wizardData.customRoles.length > 0 && (
              <>
                <div className="col-span-full mt-2 flex items-center gap-3">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Custom roles
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {wizardData.customRoles.map((roleKey) => {
                  const isSelected = selectedRole === roleKey;
                  return (
                    <button
                      key={roleKey}
                      type="button"
                      onClick={() => handleRoleSelect(roleKey)}
                      disabled={roleLoading}
                      aria-pressed={isSelected}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-all hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <CircleDot
                        className={`size-8 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <span className={`text-sm font-medium ${isSelected ? "text-primary" : ""}`}>
                        {roleKey}
                      </span>
                      <span className="text-xs text-muted-foreground">Custom role</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {roleGroup === PHYSICIAN_GROUP && (
          <div className="space-y-2">
            <p className="text-sm font-medium">License type</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PHYSICIAN_CHOICES.map((choice) => {
                const active = selectedRole === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => handlePhysicianChoice(choice)}
                    disabled={roleLoading}
                    aria-pressed={active}
                    className={`rounded-lg border-2 p-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <span className={`block text-sm font-medium ${active ? "text-primary" : ""}`}>
                      {formatRoleLabel(choice)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {choice === "MD" ? "Medical Doctor" : "Doctor of Osteopathic Medicine"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              MD and DO are tracked separately for compliance records.
            </p>
          </div>
        )}

        {step2Error && (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">{step2Error}</p>
            {selectedRole && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadSuggestions(selectedRole)}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Retry
              </Button>
            )}
          </div>
        )}

        {roleLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading credentials for this role…
          </p>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(1)}>
            <ChevronLeft className="mr-1 size-4" />
            Back
          </Button>
          <Button
            onClick={() => setStep(3)}
            disabled={!selectedRole || roleLoading || !!step2Error || !dataReady}
          >
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    );
  }

  function renderStep3() {
    const roleLabel = selectedRole ? formatRoleLabel(selectedRole) : "";
    const templateRows = wizardCredentials.filter((c) => c.fromTemplate);
    const addedRows = wizardCredentials.filter((c) => !c.fromTemplate);
    const checkedCount = wizardCredentials.filter((c) => c.checked).length;

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Credentials &amp; Review</h2>
          <p className="text-sm text-muted-foreground">
            Suggested credentials come from the {roleLabel} template. Include them now, or
            leave them for the employee&apos;s onboarding checklist.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{getValues("name")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="font-medium">{roleLabel}</p>
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
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                Credentials · {checkedCount} selected
              </h3>
              <p className="text-xs text-muted-foreground">
                Unchecking a suggested credential keeps it on the onboarding checklist — it
                just won&apos;t be created yet.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="shrink-0 gap-1"
            >
              <Plus className="size-3.5" />
              Add credential
            </Button>
          </div>

          {wizardCredentials.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-2 pt-4">
                <p className="text-sm font-medium">No credentials are required for this role</p>
                <p className="text-sm text-muted-foreground">
                  You can add credentials now, or save the staff member and add them later
                  from their profile.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Add a credential
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {templateRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    From the {roleLabel} template
                  </p>
                  {templateRows.map((row) => renderCredentialRow(row))}
                </div>
              )}
              {addedRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Additional credentials
                  </p>
                  {addedRows.map((row) => renderCredentialRow(row))}
                </div>
              )}
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

  function renderCredentialRow(row: WizardCredentialRow) {
    const dateError = rowErrors[row.credentialTypeId];
    return (
      <Card key={row.credentialTypeId} className={row.checked ? "" : "opacity-60"}>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <input
                id={`wiz-cred-${row.credentialTypeId}`}
                type="checkbox"
                checked={row.checked}
                onChange={() => toggleCredential(row.credentialTypeId)}
                className="mt-1 size-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div>
                <label
                  htmlFor={`wiz-cred-${row.credentialTypeId}`}
                  className="cursor-pointer text-sm font-medium"
                >
                  {row.name}
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {row.fromTemplate &&
                    (row.isRequired ? (
                      <Badge
                        variant="outline"
                        className="border-primary/50 text-xs text-primary"
                      >
                        Required
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Optional
                      </Badge>
                    ))}
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {row.category}
                  </Badge>
                </div>
              </div>
            </div>
            {!row.fromTemplate && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => removeCredential(row.credentialTypeId)}
                aria-label={`Remove ${row.name}`}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>

          {row.checked && (
            <div className="ml-7 mt-4 space-y-3">
              {!row.fromTemplate && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`wiz-type-${row.credentialTypeId}`} className="text-xs">
                      Credential type
                    </Label>
                    <Select
                      value={row.credentialTypeId}
                      onValueChange={(v) => v && handleRowTypeChange(row.credentialTypeId, v)}
                      items={rowTypeOptions(row.credentialTypeId).map((t) => ({
                        value: t.id,
                        label: t.name,
                      }))}
                    >
                      <SelectTrigger id={`wiz-type-${row.credentialTypeId}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rowTypeOptions(row.credentialTypeId).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`wiz-num-${row.credentialTypeId}`} className="text-xs">
                    Number / ID
                  </Label>
                  <Input
                    id={`wiz-num-${row.credentialTypeId}`}
                    placeholder="e.g. RN123456, policy number"
                    maxLength={100}
                    value={row.licenseNumber}
                    onChange={(e) =>
                      updateCredentialField(row.credentialTypeId, "licenseNumber", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`wiz-state-${row.credentialTypeId}`} className="text-xs">
                    State
                  </Label>
                  <Input
                    id={`wiz-state-${row.credentialTypeId}`}
                    placeholder="e.g. TX"
                    maxLength={100}
                    value={row.state}
                    onChange={(e) =>
                      updateCredentialField(row.credentialTypeId, "state", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`wiz-issue-${row.credentialTypeId}`} className="text-xs">
                    Issue date
                  </Label>
                  <Input
                    id={`wiz-issue-${row.credentialTypeId}`}
                    type="date"
                    value={row.issueDate}
                    onChange={(e) =>
                      updateCredentialField(row.credentialTypeId, "issueDate", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`wiz-exp-${row.credentialTypeId}`} className="text-xs">
                    Expiration date
                  </Label>
                  <Input
                    id={`wiz-exp-${row.credentialTypeId}`}
                    type="date"
                    value={row.expirationDate}
                    onChange={(e) =>
                      updateCredentialField(row.credentialTypeId, "expirationDate", e.target.value)
                    }
                  />
                </div>
              </div>

              {dateError && <p className="text-sm text-destructive">{dateError}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {renderStepIndicator()}

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}

      <WizardAddCredentialDialog
        key={String(addDialogOpen)}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        types={availableTypes()}
        onAdd={handleAddCredential}
      />
    </div>
  );
}
