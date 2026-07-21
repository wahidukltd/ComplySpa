import Link from "next/link";

export default function BillingSettingsPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 text-center py-12">
      <h2 className="text-lg font-semibold" style={{ color: "#000000" }}>Billing management</h2>
      <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
        Billing management will be available once Polar payment integration is configured.
        Your 14-day trial includes all Practice plan features.
      </p>
      <Link
        href="/dashboard/settings"
        className="inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-sm font-medium whitespace-nowrap"
        style={{ borderColor: "rgba(0,0,0,0.12)", color: "#000000", backgroundColor: "#FFFFFF" }}
      >
        Back to Settings
      </Link>
    </div>
  );
}
