import { PageHeader } from "@/components/layout/page-header";

// Loading skeleton for the billing page (plan F7): replaces the blank
// Suspense flash while the server-rendered overview resolves.
export default function BillingLoading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Billing & Plan" description="Loading your billing details…" />
      <div className="animate-pulse space-y-6">
        <div className="h-32 rounded-lg bg-[#F0F4F5]" aria-hidden="true" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-36 rounded-lg bg-[#F0F4F5]" aria-hidden="true" />
          <div className="h-36 rounded-lg bg-[#F0F4F5]" aria-hidden="true" />
        </div>
        <div className="h-44 rounded-lg bg-[#F0F4F5]" aria-hidden="true" />
      </div>
    </div>
  );
}
