"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  getTemplateSyncPreview,
  syncStaffToRoleTemplate,
} from "@/lib/actions/role-templates";
import {
  ROLE_DISPLAY_LABELS,
  ROLE_VALUES,
} from "@/lib/staff/role-credential-defaults";
import { Loader2, X, Check, RefreshCw } from "lucide-react";
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

const CATEGORY_LABELS: Record<string, string> = {
  license: "License",
  training: "Training",
  insurance: "Insurance",
  agreement: "Agreement",
};

export function TemplateEditor({
  templates,
  role,
}: {
  templates: TemplateRow[];
  role: string;
}) {
  const [selectedRole, setSelectedRole] = useState<string>(ROLE_VALUES[0]);
  const [editing, setEditing] = useState(false);
  const [draftItems, setDraftItems] = useState<TemplateItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncPreview, setSyncPreview] = useState<{ id: string; name: string }[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [credentialTypes, setCredentialTypes] = useState<CredentialTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);

  const router = useRouter();

  const isOwnerOrManager = role === "owner" || role === "manager";

  const currentTemplate = useMemo(
    () => templates.find((t) => t.role === selectedRole) ?? null,
    [templates, selectedRole],
  );

  const isClinicOverride = currentTemplate?.clinic_id !== null && currentTemplate !== null;

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
    setDraftItems((prev) => [
      ...prev,
      {
        id: `new-${typeId}`,
        credential_type_id: type.id,
        name: type.name,
        category: type.category,
        is_required: true,
        sort_order: prev.length,
      },
    ]);
  }

  const availableForAdd = useMemo(() => {
    const existing = new Set(draftItems.map((i) => i.credential_type_id));
    return credentialTypes.filter((ct) => !existing.has(ct.id));
  }, [credentialTypes, draftItems]);

  async function handleSave() {
    setSaving(true);
    const items = draftItems.map((i) => ({
      credential_type_id: i.credential_type_id,
      is_required: i.is_required,
    }));

    const result = isClinicOverride && currentTemplate
      ? await updateRoleTemplate(currentTemplate.id, { items })
      : await createRoleTemplate({ role: selectedRole, items });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `${ROLE_DISPLAY_LABELS[selectedRole] ?? selectedRole} template saved. Changes apply to future hires.`,
    );
    setEditing(false);
    setDraftItems([]);
    router.refresh();
  }

  async function handleReset() {
    if (!currentTemplate) return;
    setResetDialogOpen(false);
    const result = await deleteRoleTemplate(currentTemplate.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Reset to global default. Future hires will use the global template.");
    router.refresh();
  }

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
    toast.success(`${result.synced ?? 0} staff member${(result.synced ?? 0) === 1 ? "" : "s"} synced.`);
    router.refresh();
  }

  const requiredItems = (editing ? draftItems : currentTemplate?.items ?? []).filter((i) => i.is_required);
  const optionalItems = (editing ? draftItems : currentTemplate?.items ?? []).filter((i) => !i.is_required);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {ROLE_VALUES.map((key) => (
          <Button
            key={key}
            variant={selectedRole === key ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSelectedRole(key);
              setEditing(false);
            }}
            className="h-7 text-xs"
          >
            {ROLE_DISPLAY_LABELS[key] ?? key}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {ROLE_DISPLAY_LABELS[selectedRole] ?? selectedRole}
              </h2>
              {isClinicOverride ? (
                <Badge variant="secondary">Custom Template</Badge>
              ) : (
                <Badge variant="outline">Using global default</Badge>
              )}
            </div>
            {!editing && isOwnerOrManager && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                {currentTemplate ? "Edit" : "Create template"}
              </Button>
            )}
          </div>

          {!currentTemplate ? (
            editing ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  No template exists for this role yet. Add credential types to create a custom template.
                </p>
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
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => toggleRequired(item.id)}
                              >
                                Make optional
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                aria-label={`Remove ${item.name}`}
                                onClick={() => removeItem(item.id)}
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(v) => v && addItem(v)} value="">
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
                          "Create template"
                        )}
                      </Button>
                      <Button variant="outline" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No template found for this role. {isOwnerOrManager ? "Click Create template to make one." : ""}
              </p>
            )
          ) : (
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
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border p-2.5"
                      >
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
                              onClick={() => toggleRequired(item.id)}
                            >
                              Make optional
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              aria-label={`Remove ${item.name}`}
                              onClick={() => removeItem(item.id)}
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
                              onClick={() => toggleRequired(item.id)}
                            >
                              Make required
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              aria-label={`Remove ${item.name}`}
                              onClick={() => removeItem(item.id)}
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
                  <Select onValueChange={(v) => v && addItem(v)} value="">
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

              {editing ? (
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
                    {isClinicOverride && (
                      <Button variant="ghost" onClick={() => setResetDialogOpen(true)}>
                        Reset to global default
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                isOwnerOrManager &&
                isClinicOverride && (
                  <div className="space-y-2 border-t pt-4">
                    <Button variant="outline" size="sm" onClick={handleOpenSync} className="gap-1.5">
                      <RefreshCw className="size-3.5" />
                      Sync existing staff
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Adds any missing requirements to existing staff in this role. Does not remove completed items.
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Sync staff to {ROLE_DISPLAY_LABELS[selectedRole] ?? selectedRole} template
            </DialogTitle>
            <DialogDescription>
              {syncPreview.length === 0
                ? "No staff members need syncing — everyone in this role already has the required items."
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

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset {ROLE_DISPLAY_LABELS[selectedRole] ?? selectedRole} to global default?
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
