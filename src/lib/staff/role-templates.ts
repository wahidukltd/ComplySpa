import { createClient } from "@/lib/supabase/server";

export interface ResolvedTemplate {
  templateId: string;
  clinicId: string | null;
  required: { credentialTypeId: string; name: string }[];
  optional: { credentialTypeId: string; name: string }[];
}

interface TemplateRow {
  id: string;
  clinic_id: string | null;
  role: string;
}

interface TemplateItemRow {
  template_id: string;
  is_required: boolean;
  sort_order: number;
  credential_type_id: string;
  credential_type_name: string;
}

/** Resolve templates for the given roles: the clinic's override row wins per
 * role, else the global row (clinic-wins — the verified product rule). The
 * resolution is TEMPLATE-row-driven (057): a template with zero items still
 * resolves to an empty requirement set (e.g. the seeded `other` role) instead
 * of vanishing — `getResolvedTemplate` must never conflate "no template" with
 * "empty template". */
async function fetchResolvedTemplates(
  clinicId: string,
  roles: string[],
): Promise<Map<string, ResolvedTemplate>> {
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("role_templates")
    .select("id, clinic_id, role")
    .in("role", roles)
    .is("is_active", true)
    .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`);

  if (!templates || templates.length === 0) return new Map();

  const byRole = new Map<string, TemplateRow>();
  for (const t of templates) {
    if (t.clinic_id !== clinicId && t.clinic_id !== null) continue;
    const existing = byRole.get(t.role);
    if (!existing || (t.clinic_id !== null && existing.clinic_id === null)) {
      byRole.set(t.role, t);
    }
  }

  const templateIds = [...byRole.values()].map((t) => t.id);

  const { data: items } = await supabase
    .from("role_template_items")
    .select(`
      template_id,
      is_required,
      sort_order,
      credential_type_id,
      credential_type:credential_types!role_template_items_credential_type_id_fkey(name)
    `)
    .in("template_id", templateIds);

  const itemsByTemplate = new Map<string, TemplateItemRow[]>();
  for (const item of items ?? []) {
    const bucket = itemsByTemplate.get(item.template_id) ?? [];
    bucket.push({
      template_id: item.template_id,
      is_required: item.is_required,
      sort_order: item.sort_order,
      credential_type_id: item.credential_type_id,
      credential_type_name: item.credential_type?.name ?? "Unknown",
    });
    itemsByTemplate.set(item.template_id, bucket);
  }

  const result = new Map<string, ResolvedTemplate>();
  for (const [role, template] of byRole) {
    const roleItems = (itemsByTemplate.get(template.id) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    result.set(role, {
      templateId: template.id,
      clinicId: template.clinic_id,
      required: roleItems
        .filter((r) => r.is_required)
        .map((r) => ({ credentialTypeId: r.credential_type_id, name: r.credential_type_name })),
      optional: roleItems
        .filter((r) => !r.is_required)
        .map((r) => ({ credentialTypeId: r.credential_type_id, name: r.credential_type_name })),
    });
  }

  return result;
}

export async function getResolvedTemplate(
  clinicId: string,
  role: string,
): Promise<ResolvedTemplate | null> {
  const resolved = await fetchResolvedTemplates(clinicId, [role]);
  return resolved.get(role) ?? null;
}

export async function getResolvedTemplatesBulk(
  clinicId: string,
  roles: string[],
): Promise<Record<string, ResolvedTemplate>> {
  if (roles.length === 0) return {};
  const resolved = await fetchResolvedTemplates(clinicId, roles);
  return Object.fromEntries(resolved);
}
