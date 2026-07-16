"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClinicSchema, type CreateClinicInput } from "@/lib/validations/clinic";
import { revalidatePath } from "next/cache";

export async function createClinic(input: CreateClinicInput) {
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized. Please sign in and try again." };
  }

  const parsed = createClinicSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { error: "Validation failed", fieldErrors };
  }

  const { name, address, state } = parsed.data;

  const clerk = await clerkClient();
  let userEmail: string | undefined;
  try {
    const clerkUser = await clerk.users.getUser(userId);
    userEmail = clerkUser.emailAddresses[0]?.emailAddress;
  } catch {
    return {
      error:
        "Unable to verify your account. Please try again or contact support.",
    };
  }

  if (!userEmail) {
    return { error: "Your account must have a verified email address to continue." };
  }

  const supabase = createAdminClient();

  const { data: clinicId, error: rpcError } = await supabase.rpc(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "create_clinic_for_user" as any,
    {
      p_clerk_sub: userId,
      p_email: userEmail,
      p_name: name,
      p_address: address || null,
      p_state: state || null,
    }
  );

  if (rpcError) {
    return { error: "Unable to create clinic. Please try again." };
  }

  try {
    await clerk.users.updateUser(userId, {
      publicMetadata: { clinic_id: clinicId },
    });
  } catch {
    // ponytail: non-critical — dashboard layout queries users table directly
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
