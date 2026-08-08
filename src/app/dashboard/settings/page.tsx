import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClipboardList, History } from "lucide-react";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";
import { AlertRecipients } from "@/components/settings/alert-recipients";
import { CustomCredentialTypes } from "@/components/settings/custom-credential-types";
import { UserInviteForm } from "@/components/settings/user-invite-form";
import { UserList } from "@/components/settings/user-list";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { getAlertRecipients, getCredentialTypes, getClinicUsers } from "@/lib/actions/settings";
import { getEntitlements } from "@/lib/utils/entitlements";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, role, clinic_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (!userRecord) redirect("/onboarding");

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, address, state, plan, trial_plan")
    .eq("id", userRecord.clinic_id)
    .maybeSingle();

  if (!clinic) redirect("/onboarding");

  const [recipientsResult, typesResult, usersResult] = await Promise.all([
    getAlertRecipients(),
    getCredentialTypes(),
    getClinicUsers(),
  ]);

  const { canManageUsers, canManageAlertRecipients } = getEntitlements(clinic.plan, clinic.trial_plan);
  const ownerEmail = usersResult.users.find((u) => u.role === "owner")?.email ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Clinic identity, alert routing, credential configuration, and team access."
      >
        <Link
          href="/dashboard/settings/role-templates"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <ClipboardList className="size-4" />
          Role Templates
        </Link>
        <Link
          href="/dashboard/settings/notifications"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <History className="size-4" />
          Notification History
        </Link>
      </PageHeader>

      <SettingsTabs defaultTab={tab ?? "profile"}>
        <TabsList>
          <TabsTrigger value="profile">Clinic Profile</TabsTrigger>
          {canManageAlertRecipients && <TabsTrigger value="recipients">Alert Recipients</TabsTrigger>}
          <TabsTrigger value="credential-types">Credential Types</TabsTrigger>
          {canManageUsers && <TabsTrigger value="users">Users</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ClinicProfileForm
            name={clinic.name}
            address={clinic.address}
            state={clinic.state}
            role={userRecord.role}
          />
        </TabsContent>

        {canManageAlertRecipients && (
        <TabsContent value="recipients" className="mt-4">
          <AlertRecipients
            recipients={recipientsResult.recipients}
            ownerEmail={ownerEmail}
            role={userRecord.role}
          />
        </TabsContent>
        )}

        <TabsContent value="credential-types" className="mt-4">
          <CustomCredentialTypes
            custom={typesResult.custom}
            builtin={typesResult.builtin}
            role={userRecord.role}
          />
        </TabsContent>

        {canManageUsers && (
          <TabsContent value="users" className="mt-4 space-y-4">
            {userRecord.role === "owner" && <UserInviteForm />}
            <UserList
              users={usersResult.users}
              currentUserId={userRecord.id}
              currentUserRole={userRecord.role}
            />
          </TabsContent>
        )}
      </SettingsTabs>
    </div>
  );
}
