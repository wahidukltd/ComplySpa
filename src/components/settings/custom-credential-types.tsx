"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addCustomCredentialType } from "@/lib/actions/credential-types";
import { removeCustomCredentialType } from "@/lib/actions/settings";
import { findSimilarCredentialTypeName } from "@/lib/utils/credential-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

interface CredentialType {
  id: string;
  name: string;
  category: string;
  default_renewal_cycle_days: number | null;
}

interface CustomCredentialTypesProps {
  custom: CredentialType[];
  builtin: CredentialType[];
  role: string;
}

const CATEGORIES = [
  { value: "license", label: "License" },
  { value: "training", label: "Training" },
  { value: "insurance", label: "Insurance" },
  { value: "agreement", label: "Agreement" },
];

interface ConfirmState {
  id: string;
  name: string;
  templates: number;
  onboardingItems: number;
}

const SIMILAR_NAME_COPY =
  "A credential with a similar name already exists. If this is the credential you need, select the existing type. If it represents a different credential or requirement, you can continue creating your custom type.";

export function CustomCredentialTypes({ custom, builtin, role }: CustomCredentialTypesProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("license");
  const [renewalDays, setRenewalDays] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const canManage = role === "owner" || role === "manager";

  // Non-blocking similar-name warning (plan §4.7): matches against every
  // visible type (global + own customs). Never blocks, merges, or redirects.
  const similarName = useMemo(() => {
    if (!name.trim()) return null;
    return findSimilarCredentialTypeName(name, [...builtin, ...custom]);
  }, [name, builtin, custom]);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    const result = await addCustomCredentialType({
      name: name.trim(),
      category,
      renewal_days: renewalDays ? Number(renewalDays) : undefined,
    });
    setIsSubmitting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Credential type added");
    setName("");
    setRenewalDays("");
    router.refresh();
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    const result = await removeCustomCredentialType(id);
    setRemovingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.requiresConfirmation && result.inUse) {
      const type = custom.find((t) => t.id === id);
      setConfirmState({
        id,
        name: type?.name ?? "This credential type",
        templates: result.inUse.templates,
        onboardingItems: result.inUse.onboardingItems,
      });
      return;
    }
    toast.success("Credential type removed");
    router.refresh();
  }

  async function handleConfirmRemove() {
    if (!confirmState) return;
    setRemovingId(confirmState.id);
    const result = await removeCustomCredentialType(confirmState.id, true);
    setRemovingId(null);
    setConfirmState(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Credential type removed");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: "#000000" }}>Credential Types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: "#000000" }}>Pre-loaded Types</h3>
          <p className="text-xs mb-3" style={{ color: "rgba(0,0,0,0.55)" }}>
            Included for every clinic. If a credential you need isn&apos;t here, add it as a custom type below.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {builtin.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "#F0F4F5", backgroundColor: "#FFFFFF", color: "rgba(0,0,0,0.55)" }}
              >
                <ShieldCheck className="size-3.5 shrink-0" style={{ color: "#6E97A7" }} />
                <span>{t.name}</span>
                <span className="ml-auto text-xs capitalize" style={{ color: "rgba(0,0,0,0.12)" }}>{t.category}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator style={{ backgroundColor: "rgba(0,0,0,0.12)" }} />

        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: "#000000" }}>Custom Types</h3>
          {custom.length === 0 ? (
            <p className="text-sm mb-3" style={{ color: "rgba(0,0,0,0.55)" }}>
              No custom credential types yet — create one for credentials specific to your clinic or jurisdiction.
            </p>
          ) : (
            <div className="space-y-2 mb-3">
              {custom.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                  style={{ borderColor: "rgba(0,0,0,0.12)" }}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: "#000000" }}>{t.name}</span>
                    <span className="text-xs capitalize" style={{ color: "rgba(0,0,0,0.55)" }}>{t.category}</span>
                    {t.default_renewal_cycle_days && (
                      <span className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
                        {t.default_renewal_cycle_days}d cycle
                      </span>
                    )}
                  </div>
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={removingId === t.id}
                      onClick={() => handleRemove(t.id)}
                      aria-label={`Remove ${t.name}`}
                    >
                      {removingId === t.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" style={{ color: "rgba(0,0,0,0.55)" }} />}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <form onSubmit={handleAdd} className="space-y-3 rounded-lg border p-4" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
              <div className="space-y-1">
                <Label htmlFor="ct-name">Name</Label>
                <Input
                  id="ct-name"
                  placeholder="e.g. Botox Certification"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              {similarName && (
                <div
                  role="note"
                  className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
                  style={{ borderColor: "#C2853A", color: "#7A4E1F", backgroundColor: "#FBF0E0" }}
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{SIMILAR_NAME_COPY}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ct-category">Category</Label>
                  <select
                    id="ct-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: "rgba(0,0,0,0.12)", color: "#000000", backgroundColor: "#FFFFFF" }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ct-renewal">Renewal cycle (days, optional)</Label>
                  <Input
                    id="ct-renewal"
                    type="number"
                    min={1}
                    max={3650}
                    placeholder="e.g. 365"
                    value={renewalDays}
                    onChange={(e) => setRenewalDays(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                Add type
              </Button>
            </form>
          )}
        </div>
      </CardContent>

      <Dialog open={confirmState !== null} onOpenChange={(open) => !open && setConfirmState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {confirmState?.name}?</DialogTitle>
            <DialogDescription>
              This type is referenced in {confirmState?.onboardingItems ?? 0} staff onboarding checklist
              {confirmState?.onboardingItems === 1 ? "" : "s"} and {confirmState?.templates ?? 0} role template
              {confirmState?.templates === 1 ? "" : "s"}. Removing it will also remove those references. Existing
              credentials are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmState(null)}>Cancel</Button>
            <Button variant="destructive" disabled={removingId === confirmState?.id} onClick={handleConfirmRemove}>
              {removingId === confirmState?.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Remove type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
