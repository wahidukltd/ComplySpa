import { createClient } from "@/lib/supabase/server";

export interface ResolvedTemplate {
  templateId: string;
  clinicId: string | null;
  required: { credentialTypeId: string; name: string }[];
  optional: { credentialTypeId: string; name: string }[];
}

interface TemplateItemRow {
  template_id: string;
  clinic_id: string | null;
  role: string;
  is_required: boolean;
  sort_order: number;
  credential_type_id: string;
  credential_type_name: string;
}

async function fetchTemplateRows(clinicId: string, roles: string[]): Promise<TemplateItemRow[]> {
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("role_templates")
    .select("id, clinic_id, role, is_active")
    .in("role", roles)
    .is("is_active", true)
    .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`);

  if (!templates || templates.length === 0) return [];

  const visibleTemplates = templates.filter(
    (t) => t.clinic_id === clinicId || t.clinic_id === null,
  );
  if (visibleTemplates.length === 0) return [];

  const templateIds = visibleTemplates.map((t) => t.id);
  const templateMeta = new Map(visibleTemplates.map((t) => [t.id, t]));

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

  return (items ?? [])
    .filter((d) => templateMeta.has(d.template_id))
    .map((d) => {
      const meta = templateMeta.get(d.template_id)!;
      return {
        template_id: d.template_id,
        clinic_id: meta.clinic_id,
        role: meta.role,
        is_required: d.is_required,
        sort_order: d.sort_order,
        credential_type_id: d.credential_type_id,
        credential_type_name: d.credential_type?.name ?? "Unknown",
      };
    });
}

export async function getResolvedTemplate(clinicId: string, role: string): Promise<ResolvedTemplate | null> {
  const rows = await fetchTemplateRows(clinicId, [role]);
  const roleRows = rows.filter((r) => r.role === role);

  const clinicRows = roleRows.filter((r) => r.clinic_id === clinicId);
  const globalRows = roleRows.filter((r) => r.clinic_id === null);

  const source = clinicRows.length > 0 ? clinicRows : globalRows;
  if (source.length === 0) return null;

  source.sort((a, b) => a.sort_order - b.sort_order);

  const first = source[0];
  if (!first) return null;

  return {
    templateId: first.template_id,
    clinicId: first.clinic_id,
    required: source
      .filter((r) => r.is_required)
      .map((r) => ({ credentialTypeId: r.credential_type_id, name: r.credential_type_name })),
    optional: source
      .filter((r) => !r.is_required)
      .map((r) => ({ credentialTypeId: r.credential_type_id, name: r.credential_type_name })),
  };
}

export async function getResolvedTemplatesBulk(
  clinicId: string,
  roles: string[],
): Promise<Record<string, ResolvedTemplate>> {
  const result: Record<string, ResolvedTemplate> = {};
  if (roles.length === 0) return result;

  const rows = await fetchTemplateRows(clinicId, roles);

  for (const role of roles) {
    const roleRows = rows.filter((r) => r.role === role);
    const clinicRows = roleRows.filter((r) => r.clinic_id === clinicId);
    const globalRows = roleRows.filter((r) => r.clinic_id === null);

    const source = clinicRows.length > 0 ? clinicRows : globalRows;
    if (source.length === 0) continue;

    source.sort((a, b) => a.sort_order - b.sort_order);

    const first = source[0];
    if (!first) continue;

    result[role] = {
      templateId: first.template_id,
      clinicId: first.clinic_id,
      required: source
        .filter((r) => r.is_required)
        .map((r) => ({ credentialTypeId: r.credential_type_id, name: r.credential_type_name })),
      optional: source
        .filter((r) => !r.is_required)
        .map((r) => ({ credentialTypeId: r.credential_type_id, name: r.credential_type_name })),
    };
  }

  return result;
}
