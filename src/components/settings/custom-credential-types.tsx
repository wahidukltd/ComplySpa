"use client";

import { useState } from "react";
import { addCustomCredentialType, removeCustomCredentialType } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Trash2, ShieldCheck } from "lucide-react";
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

export function CustomCredentialTypes({ custom, builtin, role }: CustomCredentialTypesProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("license");
  const [renewalDays, setRenewalDays] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canManage = role === "owner" || role === "manager";

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    const result = await addCustomCredentialType({
      name: name.trim(),
      category: category as "license" | "training" | "insurance" | "agreement",
      default_renewal_cycle_days: renewalDays ? parseInt(renewalDays, 10) : undefined,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Credential type added");
      setName("");
      setRenewalDays("");
    }
    setIsSubmitting(false);
  }

  async function handleRemove(id: string) {
    const result = await removeCustomCredentialType(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Credential type removed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: "#3D2A25" }}>Credential Types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: "#3D2A25" }}>Pre-loaded Types</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {builtin.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "#F6E3D6", backgroundColor: "#FFF8F2", color: "#8B7D78" }}
              >
                <ShieldCheck className="size-3.5 shrink-0" style={{ color: "#9C6B5D" }} />
                <span>{t.name}</span>
                <span className="ml-auto text-xs capitalize" style={{ color: "#D9B7A7" }}>{t.category}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator style={{ backgroundColor: "#D9B7A7" }} />

        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: "#3D2A25" }}>Custom Types</h3>
          {custom.length === 0 ? (
            <p className="text-sm mb-3" style={{ color: "#8B7D78" }}>No custom credential types yet.</p>
          ) : (
            <div className="space-y-2 mb-3">
              {custom.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                  style={{ borderColor: "#D9B7A7" }}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: "#3D2A25" }}>{t.name}</span>
                    <span className="text-xs capitalize" style={{ color: "#8B7D78" }}>{t.category}</span>
                    {t.default_renewal_cycle_days && (
                      <span className="text-xs" style={{ color: "#8B7D78" }}>
                        {t.default_renewal_cycle_days}d cycle
                      </span>
                    )}
                  </div>
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(t.id)}
                      aria-label={`Remove ${t.name}`}
                    >
                      <Trash2 className="size-4" style={{ color: "#8B7D78" }} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <form onSubmit={handleAdd} className="space-y-3 rounded-lg border p-4" style={{ borderColor: "#D9B7A7" }}>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ct-category">Category</Label>
                  <select
                    id="ct-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: "#D9B7A7", color: "#3D2A25", backgroundColor: "#FFFFFF" }}
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
    </Card>
  );
}
