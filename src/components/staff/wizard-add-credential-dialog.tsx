"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Search, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addCustomCredentialType } from "@/lib/actions/credential-types";
import { customCredentialTypeSchema } from "@/lib/validations/settings";
import type { WizardCredentialType } from "@/lib/staff/wizard";

interface WizardAddCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only types NOT already in the list — duplicates are impossible. */
  types: WizardCredentialType[];
  onAdd: (typeId: string) => void;
  /** When provided, the dialog offers inline custom-type creation. */
  onCreatedType?: (type: WizardCredentialType) => void;
}

const CATEGORIES = [
  { value: "license", label: "License" },
  { value: "training", label: "Training" },
  { value: "insurance", label: "Insurance" },
  { value: "agreement", label: "Agreement" },
] as const;

export function WizardAddCredentialDialog({
  open,
  onOpenChange,
  types,
  onAdd,
  onCreatedType,
}: WizardAddCredentialDialogProps) {
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [search, setSearch] = useState("");
  const [typeName, setTypeName] = useState("");
  const [category, setCategory] = useState<string>("license");
  const [renewalDays, setRenewalDays] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // A fresh picker on every open — the parent renders this dialog with
  // key={String(addDialogOpen)}, so it remounts on every open/close and the
  // search/mode always reset (plan amendments 2026-08-09/4).
  const query = search.trim().toLowerCase();
  const filtered = query
    ? types.filter((t) => t.name.toLowerCase().includes(query))
    : types;

  async function handleCreateType() {
    const parsed = customCredentialTypeSchema.safeParse({
      name: typeName,
      category,
      renewal_days: renewalDays.trim() === "" ? undefined : Number(renewalDays),
    });
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? "Invalid credential type.");
      return;
    }
    setCreating(true);
    let result;
    try {
      result = await addCustomCredentialType({
        name: parsed.data.name,
        category: parsed.data.category,
        renewal_days: parsed.data.renewal_days,
      });
    } catch {
      setCreating(false);
      toast.error("Something went wrong. Please try again.");
      return;
    }
    setCreating(false);
    if (result.error) {
      setCreateError(result.error);
      return;
    }
    if (result.data && onCreatedType) {
      toast.success(`Credential type "${result.data.name}" created.`);
      onCreatedType({
        id: result.data.id,
        name: result.data.name,
        category: result.data.category,
        defaultRenewalCycleDays: result.data.default_renewal_cycle_days,
      });
      onOpenChange(false);
      return;
    }
    setCreateError("Failed to create credential type.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "pick" ? "Add a credential" : "Create a credential type"}
          </DialogTitle>
          <DialogDescription>
            {mode === "pick"
              ? "Choose a credential type to include in this staff member's record."
              : "New types are clinic-wide — they appear in every credential picker and template editor."}
          </DialogDescription>
        </DialogHeader>

        {mode === "pick" ? (
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search credential types..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onAdd(t.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="text-sm font-medium">{t.name}</span>
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                    {t.category}
                  </Badge>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-1 py-4 text-center text-sm text-muted-foreground">
                  {types.length === 0
                    ? "All credential types are already in this list."
                    : `No credential types match "${search}".`}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Need a second credential of the same type (e.g. another state)? Add it from the
              staff member&apos;s profile after saving.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wiz-new-type-name">Type name</Label>
              <Input
                id="wiz-new-type-name"
                placeholder="e.g. Radiofrequency Certification"
                maxLength={255}
                value={typeName}
                onChange={(e) => {
                  setTypeName(e.target.value);
                  if (createError) setCreateError(null);
                }}
                aria-invalid={!!createError}
                aria-describedby={createError ? "wiz-new-type-name-error" : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-new-type-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v)}
                items={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
              >
                <SelectTrigger id="wiz-new-type-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-new-type-renewal">Renewal cycle (days, optional)</Label>
              <Input
                id="wiz-new-type-renewal"
                type="number"
                min={1}
                max={3650}
                placeholder="e.g. 365"
                value={renewalDays}
                onChange={(e) => setRenewalDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used to auto-fill expiration dates when this type is included.
              </p>
            </div>
            {createError && (
              <p id="wiz-new-type-name-error" className="text-sm text-destructive">
                {createError}
              </p>
            )}
          </div>
        )}

        {onCreatedType && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start -mx-1"
            onClick={() => {
              if (mode === "pick") {
                setCreateError(null);
                setMode("create");
              } else {
                setMode("pick");
              }
            }}
          >
            {mode === "pick" ? (
              <>
                <Plus className="mr-1.5 size-3.5" />
                Can&apos;t find it? Create a type
              </>
            ) : (
              "Back to search"
            )}
          </Button>
        )}

        <DialogFooter>
          {mode === "create" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreateType} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create type"
                )}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
