import { redirect } from "next/navigation";

export default function AlertsRedirectPage() {
  redirect("/dashboard/settings/notifications");
}
