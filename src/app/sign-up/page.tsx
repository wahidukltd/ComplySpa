import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";

// Every account selects a plan before creation — trial is a state on a chosen
// plan, never a default. Sign-ups without a valid plan are sent to choose one.
export default async function SignUpPage(props: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await props.searchParams;
  if (plan !== "solo" && plan !== "practice") {
    redirect("/pricing?reason=select_plan");
  }
  return <SignUpForm />;
}
