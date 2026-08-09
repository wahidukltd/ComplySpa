"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createRoleTemplate } from "@/lib/actions/role-templates";
import { wizardRoleNameError, type WizardCredentialType } from "@/lib/staff/wizard";

interface WizardCreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: WizardCredentialType[];
  customRoles: string[];
  onCreated: (role: string) => void;
}

interface DraftItem {
  credential_type_id: string;
  is_required: boolean;
  name: string;
}

export function WizardCreateRoleDialog({
  open,
  onOpenChange,
  types,
  customRoles,
  onCreated,
}: WizardCreateRoleDialogProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const query = search.trim().toLowerCase();
  const available = (query
    ? types.filter((t) => t.name.toLowerCase().includes(query))
    : types
  ).filter((t) => !items.some((i) => i.credential_type_id === t.id));

  function addItem(typeId: string) {
    const type = types.find((t) => t.id === typeId);
    if (!type) return;
    setItems((prev) => [
      ...prev,
      { credential_type_id: type.id, is_required: true, name: type.name },
    ]);
    setSearch("");
  }

  function toggleRequired(typeId: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.credential_type_id === typeId ? { ...i, is_required: !i.is_required } : i,
      ),
    );
  }

  function removeItem(typeId: string) {
    setItems((prev) => prev.filter((i) => i.credential_type_id !== typeId));
  }

  async function handleCreate() {
    const error = wizardRoleNameError(name, customRoles);
    if (error) {
      setNameError(error);
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one credential to the role.");
      return;
    }
    setSaving(true);
    let result;
    try {
      result = await createRoleTemplate({
        role: name.trim(),
        items: items.map((i) => ({
          credential_type_id: i.credential_type_id,
          is_required: i.is_required,
        })),
      });
    } catch {
      setSaving(false);
      toast.error("Something went wrong. Please try again.");
      return;
    }
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Custom role "${name.trim()}" created.`);
    onCreated(name.trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a custom role</DialogTitle>
          <DialogDescription>
            The role gets a real template: onboarding, readiness, and compliance
            tracking behave exactly like the built-in roles. Manage it anytime
            in Settings → Role Templates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="wiz-new-role-name">Role name</Label>
            <Input
              id="wiz-new-role-name"
              placeholder="e.g. Dermal Specialist"
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "wiz-new-role-name-error" : undefined}
            />
            {nameError && (
              <p id="wiz-new-role-name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Credentials</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search credential types..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {available.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addItem(t.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="text-sm font-medium">{t.name}</span>
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                    {t.category}
                  </Badge>
                </button>
              ))}
              {available.length === 0 && (
                <p className="px-1 py-3 text-center text-sm text-muted-foreground">
                  {types.every((t) => items.some((i) => i.credential_type_id === t.id))
                    ? "All credential types are already on this role."
                    : `No credential types match "${search}".`}
                </p>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                On this role · {items.length}
              </p>
              {items.map((item) => (
                <div
                  key={item.credential_type_id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="text-sm font-medium">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleRequired(item.credential_type_id)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                        item.is_required
                          ? "border-primary/50 text-primary"
                          : "text-muted-foreground hover:border-muted-foreground/30"
                      }`}
                    >
                      {item.is_required ? "Required" : "Optional"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.credential_type_id)}
                      className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            At least one credential is required — a role with none would show a
            new hire as instantly ready with an empty checklist.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-1.5 size-4" />
                Create role
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
