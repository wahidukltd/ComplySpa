import { ScrollReveal } from "./scroll-reveal";
import { Users, ShieldCheck, Bell } from "lucide-react";

const STEPS = [
  {
    icon: Users,
    title: "Add your staff",
    description: "Enter each provider's name and role.",
  },
  {
    icon: ShieldCheck,
    title: "Enter credentials",
    description: "License numbers, expiration dates, verification URLs.",
  },
  {
    icon: Bell,
    title: "Get alerts before anything expires",
    description: "Email alerts at 90, 60, 30, and 7 days.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl px-4 py-20 scroll-mt-20">
      <ScrollReveal>
        <h2 className="text-center text-3xl font-bold tracking-tight" style={{ color: "#3D2A25" }}>
          Three steps to audit-ready
        </h2>
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <div className="mt-12 flex flex-col items-stretch gap-8 md:flex-row md:items-start">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex-1 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full" style={{ backgroundColor: "#F6E3D6" }}>
                <step.icon className="size-6" style={{ color: "#9C6B5D" }} aria-hidden="true" />
              </div>
              <div className="mb-2 text-sm font-medium" style={{ color: "#9C6B5D" }}>
                Step {i + 1}
              </div>
              <h3 className="text-lg font-semibold" style={{ color: "#3D2A25" }}>
                {step.title}
              </h3>
              <p className="mt-1 text-sm" style={{ color: "#8B7D78" }}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}
