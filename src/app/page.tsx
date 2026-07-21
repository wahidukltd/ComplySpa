import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { SolutionSection } from "@/components/landing/solution-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { FAQSection } from "@/components/landing/faq-section";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Med Spa Compliance Tracker — Credentials, Alerts, Audit Readiness",
  description:
    "Track staff credentials, get automated expiration alerts, and generate audit-ready compliance reports. Purpose-built for independent medical spas.",
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Med Spa Compliance",
      url: process.env.NEXT_PUBLIC_APP_URL,
      description: "Med spa compliance credential tracker with automated alerts and audit-ready reports.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Med Spa Compliance",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "29.00",
        priceCurrency: "USD",
        description: "Solo plan: 5 staff, 50 credentials, email alerts, compliance reports",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <FeaturesSection />
      <HowItWorksSection />
      <BenefitsSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
