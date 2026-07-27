import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, daysUntil } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { CredentialActions } from "./credential-actions";
import { CredentialDocument } from "./credential-document";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const CATEGORY_COLORS: Record<string, string> = {
  license: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  training: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  insurance: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  agreement: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  valid: "default",
  expiring: "secondary",
  expired: "destructive",
};

export default async function CredentialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!userRecord) redirect("/onboarding");

  const { data: credential } = await supabase
    .from("credentials")
    .select(`
      id,
      license_number,
      state,
      issue_date,
      expiration_date,
      status,
      verification_url,
      last_verified_date,
      document_url,
      notes,
      staff_member_id,
      created_at,
      updated_at,
      staff:staff_members!credentials_staff_member_id_fkey(name),
      credential_type:credential_types!credentials_credential_type_id_fkey(name, category)
    `)
    .eq("id", id)
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .single();

  if (!credential) notFound();

  const typeName = credential.credential_type?.name ?? "Credential";
  const category = credential.credential_type?.category;
  const status = credential.status;

  const daysRemaining = credential.expiration_date ? daysUntil(credential.expiration_date) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/credentials"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to credentials
        </Link>
      </div>

      <PageHeader title={typeName} description="Credential details">
        <div className="flex gap-2">
          <Link
            href={`/dashboard/staff/${credential.staff_member_id}`}
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
          >
            View staff
          </Link>
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Staff Member</p>
                  <Link
                    href={`/dashboard/staff/${credential.staff_member_id}`}
                    className="font-medium hover:underline"
                  >
                    {credential.staff?.name ?? "—"}
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={STATUS_VARIANTS[status] ?? "outline"} className="mt-0.5">
                    {status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  {category ? (
                    <span
                      className={`mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {category}
                    </span>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Number / ID</p>
                  <p className="text-sm">{credential.license_number || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">State</p>
                  <p className="text-sm">{credential.state || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Issue Date</p>
                  <p className="text-sm">
                    {credential.issue_date ? formatDate(credential.issue_date) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expiration Date</p>
                  <p className="text-sm">
                    {credential.expiration_date
                      ? `${formatDate(credential.expiration_date)}${daysRemaining !== null ? ` (${daysRemaining}d)` : ""}`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Verified</p>
                  <p className="text-sm">
                    {credential.last_verified_date
                      ? formatDate(credential.last_verified_date)
                      : "Never"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {credential.verification_url && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Verification URL</p>
                    <a
                      href={credential.verification_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {credential.verification_url}
                    </a>
                  </div>
                  <a
                    href={credential.verification_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          {credential.document_url && (
            <CredentialDocument filePath={credential.document_url} />
          )}

          {credential.notes && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{credential.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground">Actions</p>
              <div className="mt-3 flex flex-col gap-2">
                <CredentialActions
                  credentialId={credential.id}
                  staffMemberId={credential.staff_member_id}
                  verificationUrl={credential.verification_url}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm">{formatDate(credential.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-sm">{formatDate(credential.updated_at)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
