import type { Metadata } from "next";
import { PlanCards } from "@/components/pricing/plan-cards";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { FaqAccordion } from "@/components/pricing/faq-accordion";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Plans & Pricing — Simple, Transparent Compliance Pricing",
  description:
    "Solo $29/mo, Practice $49/mo, Multi-Location $79/mo. 14-day free trial, no credit card required.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Med Spa Compliance Pricing — $29/mo and up",
    description: "Simple, transparent pricing for med spa compliance tracking. 14-day free trial.",
  },
};

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "OfferCatalog",
  name: "Plans & Pricing",
  itemListElement: [
    {
      "@type": "Offer",
      name: "Solo Plan",
      price: "29.00",
      priceCurrency: "USD",
      description: "5 staff, 50 credentials, email alerts, basic reports. 14-day free trial.",
    },
    {
      "@type": "Offer",
      name: "Practice Plan",
      price: "79.00",
      priceCurrency: "USD",
      description: "15 staff, 300 credentials, email alerts, audit-ready reports, inspection-readiness engine.",
    },
    {
      "@type": "Offer",
      name: "Multi-Location Plan",
      price: "149.00",
      priceCurrency: "USD",
      description: "50 staff, 1000 credentials, 5 locations, API access, white-label reports.",
    },
  ],
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 xl:max-w-6xl xl:px-8 xl:py-20 2xl:max-w-7xl 2xl:px-12">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight xl:text-4xl 2xl:text-5xl" style={{ color: "#000000" }}>
          Simple, transparent pricing.
        </h1>
        <p className="mt-2" style={{ color: "rgba(0,0,0,0.55)" }}>
          14-day free trial. No credit card. Cancel anytime.
        </p>
      </div>

      <PlanCards />

      <div className="mt-16">
        <h2 className="mb-6 text-center text-2xl font-semibold" style={{ color: "#000000" }}>
          Feature comparison
        </h2>
        <ComparisonTable />
      </div>

      <div className="mt-16 max-w-2xl mx-auto xl:max-w-3xl 2xl:max-w-4xl">
        <h2 className="mb-6 text-center text-2xl font-semibold" style={{ color: "#000000" }}>
          Frequently asked questions
        </h2>
        <FaqAccordion />
      </div>

      <ScrollReveal className="mt-16 text-center">
        <h2 className="text-2xl font-semibold" style={{ color: "#000000" }}>
          Start your 14-day free trial.
        </h2>
        <p className="mt-2 text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
          No credit card. Cancel anytime. Data preserved for 30 days after trial.
        </p>
        <Link
          href="/sign-up"
          className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-6")}
        >
          Get started
        </Link>
      </ScrollReveal>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
    </div>
  );
}
