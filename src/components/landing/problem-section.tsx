import { ScrollReveal } from "./scroll-reveal";
import { AlertTriangle } from "lucide-react";

const PAIN_POINTS = [
  {
    quote:
      "The #1 board citation is the ghost medical director — an agreement on paper with no evidence of active oversight.",
    source: "MedSpa Standards, 2026 Inspection Guide",
    href: "https://medspastandards.com/blog/med-spa-inspection-guide",
  },
  {
    quote:
      "Staff performing services outside their license is the most common cause of board investigations.",
    source: "AmSpa — Why Your Medical Spa Will Be Investigated",
    href: "https://www.americanmedspa.org/news/why-your-medical-spa-will-be-investigated/",
  },
  {
    quote:
      "Most med spas track compliance on spreadsheets. One missed expiration and the whole system falls apart.",
    source: "Verisys — Automate Credential Expiration Tracking",
    href: "https://verisys.com/blog/automate-credential-expiration-tracking/",
  },
  {
    quote:
      "A failed inspection costs $5,000–$50,000+ in fines. The documentation gap is what sinks clinics.",
    source: "Prospyr — Certification Management for Med Spas",
    href: "https://prospyrmed.com/blog/post/certification-management-med-spas-importance",
  },
];

export function ProblemSection() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      <ScrollReveal>
        <h2 className="text-center text-3xl font-bold tracking-tight" style={{ color: "#3D2A25" }}>
          The inspection isn&apos;t what sinks you. It&apos;s the gap before it.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center" style={{ color: "#8B7D78" }}>
          State board inspections are complaint-driven. Most med spas are never inspected — until they are.
        </p>
      </ScrollReveal>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {PAIN_POINTS.map((p, i) => (
          <ScrollReveal key={i} delay={i * 100}>
            <div
              className="rounded-lg border p-6"
              style={{ borderColor: "#D9B7A7", backgroundColor: "#FFFFFF" }}
            >
              <AlertTriangle className="mb-3 size-5" style={{ color: "#B8443A" }} aria-hidden="true" />
              <p className="text-base" style={{ color: "#3D2A25" }}>
                {p.quote}
              </p>
              <p className="mt-3 text-xs" style={{ color: "#8B7D78" }}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:underline"
                  style={{ color: "#9C6B5D" }}
                >
                  {p.source} →
                </a>
              </p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
