"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createRoleTemplate,
  updateRoleTemplate,
  deleteRoleTemplate,
  renameRoleTemplate,
  getTemplateSyncPreview,
  syncStaffToRoleTemplate,
} from "@/lib/actions/role-templates";
import { BUILT_IN_ROLES, formatRoleLabel, isBuiltInRole, roleNameSchema } from "@/lib/utils/roles";
import { Loader2, X, Check, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

interface TemplateItem {
  id: string;
  credential_type_id: string;
  name: string;
  category: string;
  is_required: boolean;
  sort_order: number;
}

interface TemplateRow {
  id: string;
  clinic_id: string | null;
  role: string;
  is_active: boolean;
  updated_at: string;
  items: TemplateItem[];
}

interface CredentialTypeOption {
  id: string;
  name: string;
  category: string;
}

interface RoleOption {
  value: string;
  label: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  license: "License",
  training: "Training",
  insurance: "Insurance",
  agreement: "Agreement",
};

/** Shared required/optional item editor used by the detail panel (edit mode)
 * and the create-custom-role dialog — one implementation, no drift. */
function TemplateItemsEditor({
  items,
  editing,
  credentialTypes,
  typesLoading,
  onToggleRequired,
  onRemove,
  onAdd,
}: {
  items: TemplateItem[];
  editing: boolean;
  credentialTypes: CredentialTypeOption[];
  typesLoading: boolean;
  onToggleRequired: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onAdd: (typeId: string) => void;
}) {
  const availableForAdd = useMemo(() => {
    const existing = new Set(items.map((i) => i.credential_type_id));
    return credentialTypes.filter((ct) => !existing.has(ct.id));
  }, [credentialTypes, items]);

  const requiredItems = items.filter((i) => i.is_required);
  const optionalItems = items.filter((i) => !i.is_required);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Required ({requiredItems.length})
        </p>
        {requiredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No required credentials.</p>
        ) : (
          <div className="space-y-1.5">
            {requiredItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <Check className="size-4 text-[#4A8C5C]" />
                  <span className="text-sm font-medium">{item.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </Badge>
                </div>
                {editing && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onToggleRequired(item.id)}
                    >
                      Make optional
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => onRemove(item.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Optional ({optionalItems.length})
        </p>
        {optionalItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No optional credentials.</p>
        ) : (
          <div className="space-y-1.5">
            {optionalItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-dashed p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </Badge>
                </div>
                {editing && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onToggleRequired(item.id)}
                    >
                      Make required
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => onRemove(item.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-2">
          <Select onValueChange={(v) => v && onAdd(v)} value="">
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="+ Add credential type" />
            </SelectTrigger>
            <SelectContent>
              {typesLoading ? (
                <SelectItem value="__loading__" disabled>
                  Loading...
                </SelectItem>
              ) : availableForAdd.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  All credential types added
                </SelectItem>
              ) : (
                availableForAdd.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>
                    {ct.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

/** Shared draft-item builder for the panel editor and the create dialog
 * (review finding N7 — one construction, no drift). */
function buildDraftItem(type: CredentialTypeOption, existing: TemplateItem[]): TemplateItem {
  return {
    id: `new-${type.id}`,
    credential_type_id: type.id,
    name: type.name,
    category: type.category,
    is_required: true,
    sort_order: existing.length,
  };
}

export function TemplateEditor({
  templates,
  role,
}: {
  templates: TemplateRow[];
  role: string;
}) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<string>(BUILT_IN_ROLES[0]);
  const [editing, setEditing] = useState(false);
  const [draftItems, setDraftItems] = useState<TemplateItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncPreview, setSyncPreview] = useState<{ id: string; name: string }[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createNameError, setCreateNameError] = useState<string | null>(null);
  const [createItems, setCreateItems] = useState<TemplateItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [credentialTypes, setCredentialTypes] = useState<CredentialTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [roleStaffCount, setRoleStaffCount] = useState<number | null>(null);

  const isOwnerOrManager = role === "owner" || role === "manager";

  // Clinic-wins resolution (057): the clinic override row is the template for
  // the selected role when it exists, else the global default. Never
  // array-order-dependent.
  const currentTemplate = useMemo(() => {
    const clinicRow = templates.find((t) => t.role === selectedRole && t.clinic_id !== null);
    return clinicRow ?? templates.find((t) => t.role === selectedRole) ?? null;
  }, [templates, selectedRole]);

  const isOverride = currentTemplate !== null && currentTemplate.clinic_id !== null;
  const isCustomRole = !isBuiltInRole(selectedRole);

  // Custom roles = clinic rows whose role has no built-in twin; the built-ins
  // render in their canonical order, custom roles appended sorted.
  const customRoles = useMemo(() => {
    const roles = new Set(
      templates.filter((t) => !isBuiltInRole(t.role)).map((t) => t.role),
    );
    return [...roles].sort();
  }, [templates]);

  const roleListOptions = useMemo<RoleOption[]>(
    () => [
      ...BUILT_IN_ROLES.map((key) => ({ value: key, label: formatRoleLabel(key) })),
      ...customRoles.map((r) => ({ value: r, label: r })),
    ],
    [customRoles],
  );

  function selectRole(nextRole: string) {
    setSelectedRole(nextRole);
    setEditing(false);
    setDraftItems([]);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("credential_types")
        .select("id, name, category")
        .order("name");
      if (error) {
        Sentry.captureException(error);
        if (!cancelled) setTypesLoading(false);
        return;
      }
      if (!cancelled) {
        setCredentialTypes(data ?? []);
        setTypesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: userRecord } = await supabase
        .from("users")
        .select("clinic_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!userRecord || cancelled) return;
      setClinicId(userRecord.clinic_id);
    })();
    return () => { cancelled = true; };
  }, []);

  // Active-staff count for the selected role — feeds the rename and delete
  // dialogs' honest impact notes. Matches the RPC guards' semantics
  // (deleted_at IS NULL — suspended staff count, they can be restored;
  // review finding N4 alignment). The clinic id is resolved once above, not
  // per role switch (review finding N6).
  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("staff_members")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("role", selectedRole)
        .is("deleted_at", null);
      if (!cancelled) setRoleStaffCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [clinicId, selectedRole]);

  // ── Edit / Customize (global defaults) ──────────────────────────────────
  function startEdit() {
    setDraftItems(currentTemplate ? currentTemplate.items.map((i) => ({ ...i })) : []);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraftItems([]);
  }

  function toggleRequired(itemId: string) {
    setDraftItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, is_required: !i.is_required } : i)),
    );
  }

  function removeItem(itemId: string) {
    setDraftItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  function addItem(typeId: string) {
    const type = credentialTypes.find((ct) => ct.id === typeId);
    if (!type) return;
    if (draftItems.some((i) => i.credential_type_id === typeId)) {
      toast.error("This credential type is already in the template.");
      return;
    }
    setDraftItems((prev) => [...prev, buildDraftItem(type, prev)]);
  }

  async function handleSave() {
    setSaving(true);
    const items = draftItems.map((i) => ({
      credential_type_id: i.credential_type_id,
      is_required: i.is_required,
    }));

    const result = currentTemplate && isOverride
      ? await updateRoleTemplate(currentTemplate.id, { items })
      : await createRoleTemplate({ role: selectedRole, items });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `${formatRoleLabel(selectedRole)} template saved. Changes apply to future hires.`,
    );
    setEditing(false);
    setDraftItems([]);
    router.refresh();
  }

  // ── Create custom role ──────────────────────────────────────────────────
  function openCreate() {
    setCreateName("");
    setCreateNameError(null);
    setCreateItems([]);
    setCreateOpen(true);
  }

  function validateCreateName(name: string): string | null {
    const parsed = roleNameSchema.safeParse(name);
    if (!parsed.success) {
      return parsed.error.issues[0]?.message ?? "Invalid role name.";
    }
    const trimmed = parsed.data;
    const ownClinicDup = templates.some(
      (t) => t.clinic_id !== null && t.role.toLowerCase() === trimmed.toLowerCase(),
    );
    if (ownClinicDup) return "A role with this name already exists in your clinic.";
    return null;
  }

  async function handleCreate() {
    const error = validateCreateName(createName);
    if (error) {
      setCreateNameError(error);
      return;
    }
    setCreating(true);
    const result = await createRoleTemplate({
      role: createName.trim(),
      items: createItems.map((i) => ({ credential_type_id: i.credential_type_id, is_required: i.is_required })),
    });
    setCreating(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Custom role "${createName.trim()}" created.`);
    setCreateOpen(false);
    setCreateName("");
    setCreateNameError(null);
    setCreateItems([]);
    router.refresh();
  }

  // ── Rename custom role ──────────────────────────────────────────────────
  function openRename() {
    setRenameValue(currentTemplate?.role ?? "");
    setRenameError(null);
    setRenameOpen(true);
  }

  async function handleRename() {
    const parsed = roleNameSchema.safeParse(renameValue);
    if (!parsed.success) {
      setRenameError(parsed.error.issues[0]?.message ?? "Invalid role name.");
      return;
    }
    if (!currentTemplate) return;
    const trimmed = parsed.data;
    if (trimmed.toLowerCase() === currentTemplate.role.toLowerCase()) {
      setRenameError("Enter a different role name.");
      return;
    }
    // Collision guard mirror: the new name must not collide with any global or
    // own-clinic template (the RPC is the authoritative check).
    const collision = templates.some(
      (t) => t.id !== currentTemplate.id && t.role.toLowerCase() === trimmed.toLowerCase(),
    );
    if (collision) {
      setRenameError("A role with this name already exists.");
      return;
    }
    setRenaming(true);
    const result = await renameRoleTemplate(currentTemplate.id, trimmed);
    setRenaming(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const moved = result.moved ?? 0;
    toast.success(
      moved > 0
        ? `Role renamed — ${moved} staff member${moved === 1 ? "" : "s"} now carry the new name. Their requirements are unchanged.`
        : "Role renamed. No staff members were assigned to it.",
    );
    setRenameOpen(false);
    // The old role no longer exists — select the new name so the panel never
    // sits on a ghost role (review finding SF7). selectRole also resets the
    // editing/draft state.
    selectRole(trimmed);
    router.refresh();
  }

  // ── Delete custom role ──────────────────────────────────────────────────
  function openDelete() {
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!currentTemplate) return;
    setDeleting(true);
    const result = await deleteRoleTemplate(currentTemplate.id);
    setDeleting(false);
    if (result.error) {
      // Keep the dialog open on failure — a stale client count (a hire landed
      // after the count loaded) must not bury the RPC's message behind a
      // closing dialog (review finding N5). Null the count so the dialog
      // converges: the confirm disables and the blocking copy shows, instead
      // of looping on a stale "0 staff" state (re-review warning).
      setRoleStaffCount(null);
      toast.error(result.error);
      return;
    }
    toast.success(`Role "${formatRoleLabel(selectedRole)}" deleted.`);
    setDeleteOpen(false);
    // The role is gone — select a valid role so the panel never sits on a
    // ghost role (review finding SF7).
    setSelectedRole(BUILT_IN_ROLES[0]);
    router.refresh();
  }

  // ── Reset override to global default ────────────────────────────────────
  async function handleReset() {
    if (!currentTemplate) return;
    const result = await deleteRoleTemplate(currentTemplate.id);
    if (result.error) {
      // Keep the dialog open on failure (same convention as the delete
      // dialog, re-review note) — a failure must be explainable, not just
      // toasted.
      toast.error(result.error);
      return;
    }
    setResetDialogOpen(false);
    toast.success("Reset to global default. Future hires will use the global template.");
    router.refresh();
  }

  // ── Sync existing staff (all template states) ───────────────────────────
  async function handleOpenSync() {
    const result = await getTemplateSyncPreview(selectedRole);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSyncPreview(result.data?.staff ?? []);
    setSyncDialogOpen(true);
  }

  async function handleSync() {
    setSyncing(true);
    const result = await syncStaffToRoleTemplate(selectedRole);
    setSyncing(false);
    setSyncDialogOpen(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const synced = result.synced ?? 0;
    const added = result.added ?? 0;
    // Distinct units (review finding SF5): requirements added vs staff processed.
    toast.success(
      added > 0
        ? `${added} requirement${added === 1 ? "" : "s"} added for ${synced} staff member${synced === 1 ? "" : "s"}.`
        : `No new requirements to add — ${synced} staff member${synced === 1 ? "" : "s"} checked.`,
    );
    router.refresh();
  }

  const emptyOverrideNote =
    isOverride && currentTemplate !== null && currentTemplate.items.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={selectedRole}
          onValueChange={(v) => v && selectRole(v)}
          items={roleListOptions}
        >
          <SelectTrigger className="w-full max-w-xs lg:hidden" aria-label="Select role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleListOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {isOwnerOrManager && (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="size-4" />
            Create custom role
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="hidden lg:block space-y-5" aria-label="Role templates">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ComplySpa defaults
            </p>
            <ul className="mt-2 max-h-[340px] space-y-1 overflow-y-auto pr-1">
              {BUILT_IN_ROLES.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => selectRole(key)}
                    title={formatRoleLabel(key)}
                    className={`w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      selectedRole === key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {formatRoleLabel(key)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Custom roles
              {customRoles.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {customRoles.length}
                </span>
              )}
            </p>
            {customRoles.length === 0 ? (
              <p className="mt-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No custom roles yet — create one for roles not covered by the defaults.
              </p>
            ) : (
              <ul className="mt-2 max-h-[340px] space-y-1 overflow-y-auto pr-1">
                {customRoles.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => selectRole(key)}
                      title={key}
                      className={`w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        selectedRole === key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {key}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </nav>

        <Card className="min-w-0">
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{formatRoleLabel(selectedRole)}</h2>
                {isCustomRole ? (
                  <Badge variant="secondary">Custom role</Badge>
                ) : isOverride ? (
                  <Badge variant="secondary">Customized default</Badge>
                ) : (
                  <Badge variant="outline">Using global default</Badge>
                )}
              </div>
              {!editing && isOwnerOrManager && (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  {isOverride || isCustomRole ? "Edit" : "Customize"}
                </Button>
              )}
            </div>

            {emptyOverrideNote && (
              <div className="mb-4 rounded-lg border border-[#C2853A]/40 bg-[#C2853A]/10 px-4 py-3 text-sm">
                This customized template has no requirements — it fully replaces the global
                default. Future hires in this role will have an empty checklist.
              </div>
            )}

            {editing ? (
              <div className="space-y-4">
                <TemplateItemsEditor
                  items={draftItems}
                  editing
                  credentialTypes={credentialTypes}
                  typesLoading={typesLoading}
                  onToggleRequired={toggleRequired}
                  onRemove={removeItem}
                  onAdd={addItem}
                />
                <div className="space-y-2 border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    Changes apply to future hires. Existing staff are updated only when you sync them.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save changes"
                      )}
                    </Button>
                    <Button variant="outline" onClick={cancelEdit}>
                      Cancel
                    </Button>
                    {isOverride && (
                      <Button variant="ghost" onClick={() => setResetDialogOpen(true)}>
                        Reset to global default
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <TemplateItemsEditor
                  items={currentTemplate?.items ?? []}
                  editing={false}
                  credentialTypes={credentialTypes}
                  typesLoading={typesLoading}
                  onToggleRequired={toggleRequired}
                  onRemove={removeItem}
                  onAdd={addItem}
                />

                {isOwnerOrManager && (
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleOpenSync} className="gap-1.5">
                        <RefreshCw className="size-3.5" />
                        Sync existing staff
                      </Button>
                      {isCustomRole && currentTemplate && (
                        <>
                          <Button variant="outline" size="sm" onClick={openRename} className="gap-1.5">
                            Rename
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            onClick={openDelete}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Adds any missing requirements to existing staff in this role. Does not remove
                      completed items.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Sync staff to {formatRoleLabel(selectedRole)} template
            </DialogTitle>
            <DialogDescription>
              {syncPreview.length === 0
                ? "No staff members need syncing — everyone in this role already has all of their requirements."
                : `${syncPreview.length} existing staff member${syncPreview.length === 1 ? "" : "s"} will get the missing requirements added.`}
            </DialogDescription>
          </DialogHeader>
          {syncPreview.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Staff affected:</p>
              <div className="flex flex-wrap gap-1.5">
                {syncPreview.slice(0, 8).map((s) => (
                  <Badge key={s.id} variant="secondary">
                    {s.name}
                  </Badge>
                ))}
                {syncPreview.length > 8 && (
                  <Badge variant="outline">+{syncPreview.length - 8} more</Badge>
                )}
              </div>
              <div className="space-y-1 pt-2 text-xs text-muted-foreground">
                <p className="flex items-center gap-1">
                  <Check className="size-3.5 text-[#4A8C5C]" /> Add missing requirements
                </p>
                <p className="flex items-center gap-1">
                  <X className="size-3.5 text-muted-foreground" /> Will not touch completed items
                </p>
                <p className="flex items-center gap-1">
                  <X className="size-3.5 text-muted-foreground" /> Will not remove anything
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSync}
              disabled={syncing || syncPreview.length === 0}
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                `Sync ${syncPreview.length} staff`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create custom role</DialogTitle>
            <DialogDescription>
              Define a role not covered by the ComplySpa defaults. Its requirements apply to
              future hires and sync to existing staff when you choose.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-role-name">
                Role name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="custom-role-name"
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value);
                  setCreateNameError(null);
                }}
                placeholder="e.g. Laser Technician"
                maxLength={80}
                aria-invalid={!!createNameError}
              />
              {createNameError && (
                <p className="text-sm text-destructive">{createNameError}</p>
              )}
              {!createNameError &&
                createName.trim() &&
                templates.some(
                  (t) => t.clinic_id === null && t.role.toLowerCase() === createName.trim().toLowerCase(),
                ) && (
                  <p className="text-xs text-muted-foreground">
                    This matches a ComplySpa default role — use &quot;Customize&quot; on that role
                    instead to keep the global template intact.
                  </p>
                )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Requirements
              </p>
              <TemplateItemsEditor
                items={createItems}
                editing
                credentialTypes={credentialTypes}
                typesLoading={typesLoading}
                onToggleRequired={(itemId) =>
                  setCreateItems((prev) =>
                    prev.map((i) => (i.id === itemId ? { ...i, is_required: !i.is_required } : i)),
                  )
                }
                onRemove={(itemId) => setCreateItems((prev) => prev.filter((i) => i.id !== itemId))}
                onAdd={(typeId) => {
                  const type = credentialTypes.find((ct) => ct.id === typeId);
                  if (!type) return;
                  if (createItems.some((i) => i.credential_type_id === typeId)) {
                    toast.error("This credential type is already in the template.");
                    return;
                  }
                  setCreateItems((prev) => [...prev, buildDraftItem(type, prev)]);
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {formatRoleLabel(selectedRole)}</DialogTitle>
            <DialogDescription>
              The new name applies to this role everywhere. Existing staff requirements are
              unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-role-name">New role name</Label>
            <Input
              id="rename-role-name"
              value={renameValue}
              onChange={(e) => {
                setRenameValue(e.target.value);
                setRenameError(null);
              }}
              maxLength={80}
              aria-invalid={!!renameError}
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
            {roleStaffCount !== null && roleStaffCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {roleStaffCount} staff member{roleStaffCount === 1 ? "" : "s"} in this role will
                carry the new name.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={renaming}>
              {renaming ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Renaming...
                </>
              ) : (
                "Rename role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {formatRoleLabel(selectedRole)}?</DialogTitle>
            <DialogDescription>
              {roleStaffCount !== null && roleStaffCount > 0 ? (
                <>
                  This role is assigned to {roleStaffCount} staff member
                  {roleStaffCount === 1 ? "" : "s"}. Reassign or remove them first — deleting the
                  template would leave them without a role template.
                </>
              ) : (
                "This deletes the custom role template. Future hires can no longer be assigned to it."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || (roleStaffCount ?? 0) > 0}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset {formatRoleLabel(selectedRole)} to global default?
            </DialogTitle>
            <DialogDescription>
              This will remove your custom template for this role. Future hires will use the global
              default. Existing staff are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Reset to global default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
