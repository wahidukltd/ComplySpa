import { ScrollReveal } from "./scroll-reveal";
import { PlanCards } from "@/components/pricing/plan-cards";

export function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-5xl px-4 py-20 scroll-mt-20">
      <ScrollReveal>
        <h2 className="text-center text-3xl font-bold tracking-tight" style={{ color: "#000000" }}>
          Simple pricing. No surprises.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center" style={{ color: "rgba(0,0,0,0.55)" }}>
          14-day free trial. No credit card required. Cancel anytime.
        </p>
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <div className="mt-12">
          <PlanCards />
        </div>
      </ScrollReveal>

      <ScrollReveal delay={200}>
        <p className="mt-8 text-center text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
          HCP charges $3,000/year for general healthcare compliance. Same coverage, 88% less — and built specifically for med spas.
        </p>
      </ScrollReveal>
    </section>
  );
}
