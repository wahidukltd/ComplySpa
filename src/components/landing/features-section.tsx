import { ScrollReveal } from "./scroll-reveal";
import { ShieldCheck, Bell, FileText, ClipboardCheck } from "lucide-react";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Credential Tracker",
    description:
      "12 pre-loaded credential types. Custom types for your jurisdiction.",
  },
  {
    icon: Bell,
    title: "Expiration Alerts",
    description:
      "Email alerts at 90, 60, 30, and 7 days before expiration. Escalation for expired credentials.",
  },
  {
    icon: FileText,
    title: "Audit-Ready Reports",
    description:
      "Generate compliance reports as PDF. Inspector-formatted, clinic-branded.",
  },
  {
    icon: ClipboardCheck,
    title: "Inspection Readiness",
    description:
      "7-point checklist that auto-fills from your credential data. Know your readiness score before an inspector asks.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-5xl px-4 py-20 scroll-mt-20">
      <ScrollReveal>
        <h2 className="text-center text-3xl font-bold tracking-tight" style={{ color: "#3D2A25" }}>
          Everything you need to stay inspection-ready
        </h2>
      </ScrollReveal>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {FEATURES.map((f, i) => (
          <ScrollReveal key={f.title} delay={i * 50}>
            <div
              className="rounded-lg border p-6"
              style={{ borderColor: "#D9B7A7", backgroundColor: "#FFFFFF" }}
            >
              <div
                className="mb-4 flex size-10 items-center justify-center rounded-full"
                style={{ backgroundColor: "#F6E3D6" }}
              >
                <f.icon className="size-5" style={{ color: "#9C6B5D" }} aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold" style={{ color: "#3D2A25" }}>
                {f.title}
              </h3>
              <p className="mt-2 text-sm" style={{ color: "#8B7D78" }}>
                {f.description}
              </p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
