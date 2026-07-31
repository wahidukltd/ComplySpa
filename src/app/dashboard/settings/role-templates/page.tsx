import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft } from "lucide-react";
import { getRoleTemplates } from "@/lib/actions/role-templates";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

export default async function RoleTemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!userRecord) redirect("/onboarding");

  const result = await getRoleTemplates();
  const templates = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to settings
        </Link>
      </div>

      <PageHeader
        title="Role Templates"
        description="Define what each staff role must hold to be compliant. Future hires inherit these requirements automatically."
      />

      <TemplateEditor
        templates={templates}
        role={userRecord.role}
      />
    </div>
  );
}
