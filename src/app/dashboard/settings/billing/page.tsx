import Link from "next/link";

export default function BillingSettingsPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 text-center py-12">
      <h2 className="text-lg font-semibold" style={{ color: "#3D2A25" }}>Billing management</h2>
      <p className="text-sm" style={{ color: "#8B7D78" }}>
        Billing management will be available once Polar payment integration is configured.
        Your 14-day trial includes all Practice plan features.
      </p>
      <Link
        href="/dashboard/settings"
        className="inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-sm font-medium whitespace-nowrap"
        style={{ borderColor: "#D9B7A7", color: "#3D2A25", backgroundColor: "#FFFFFF" }}
      >
        Back to Settings
      </Link>
    </div>
  );
}
