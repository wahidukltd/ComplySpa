import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";
import { AlertRecipients } from "@/components/settings/alert-recipients";
import { CustomCredentialTypes } from "@/components/settings/custom-credential-types";
import { UserInviteForm } from "@/components/settings/user-invite-form";
import { UserList } from "@/components/settings/user-list";
import { getAlertRecipients, getCredentialTypes, getClinicUsers } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createClient();

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, role, clinic_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!userRecord) redirect("/onboarding");

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, address, state, plan")
    .eq("id", userRecord.clinic_id)
    .maybeSingle();

  if (!clinic) redirect("/onboarding");

  const [recipientsResult, typesResult, usersResult] = await Promise.all([
    getAlertRecipients(),
    getCredentialTypes(),
    getClinicUsers(),
  ]);

  const ownerEmail = usersResult.users.find((u) => u.role === "owner")?.email ?? null;
  const showUsersTab = clinic.plan !== "solo";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your clinic profile, alert recipients, credential types, and team."
      />

      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Clinic Profile</TabsTrigger>
          <TabsTrigger value="recipients">Alert Recipients</TabsTrigger>
          <TabsTrigger value="credential-types">Credential Types</TabsTrigger>
          {showUsersTab && <TabsTrigger value="users">Users</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ClinicProfileForm
            name={clinic.name}
            address={clinic.address}
            state={clinic.state}
          />
        </TabsContent>

        <TabsContent value="recipients" className="mt-4">
          <AlertRecipients
            recipients={recipientsResult.recipients}
            ownerEmail={ownerEmail}
            role={userRecord.role}
          />
        </TabsContent>

        <TabsContent value="credential-types" className="mt-4">
          <CustomCredentialTypes
            custom={typesResult.custom}
            builtin={typesResult.builtin}
            role={userRecord.role}
          />
        </TabsContent>

        {showUsersTab && (
          <TabsContent value="users" className="mt-4 space-y-4">
            {userRecord.role === "owner" && <UserInviteForm />}
            <UserList
              users={usersResult.users}
              currentUserId={userRecord.id}
              currentUserRole={userRecord.role}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
