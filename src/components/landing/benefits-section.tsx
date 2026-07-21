import { ScrollReveal } from "./scroll-reveal";

const ROWS = [
  {
    title: "Never miss a license renewal.",
    text: "Alerts fire at 90, 60, 30, and 7 days. Escalation alerts if a credential expires without renewal.",
    imageFirst: true,
  },
  {
    title: "Pass board audits in 15 minutes.",
    text: "Hand the inspector a readiness report with your score, credential status, and gap remediation tracked.",
    imageFirst: false,
  },
];

export function BenefitsSection() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      {ROWS.map((row, i) => (
        <ScrollReveal key={row.title} delay={i * 200}>
          <div className={`grid items-center gap-12 md:grid-cols-2 ${i > 0 ? "mt-20" : ""}`}>
            <div
              className={`flex aspect-video items-center justify-center rounded-xl border ${row.imageFirst ? "md:order-1" : "md:order-2"}`}
              style={{ borderColor: "#D9B7A7", backgroundColor: "#F6E3D6" }}
            >
              <span className="text-sm" style={{ color: "#8B7D78" }}>
                Product preview
              </span>
            </div>
            <div className={row.imageFirst ? "md:order-2" : "md:order-1"}>
              <h3 className="text-2xl font-bold tracking-tight" style={{ color: "#3D2A25" }}>
                {row.title}
              </h3>
              <p className="mt-3" style={{ color: "#8B7D78" }}>
                {row.text}
              </p>
            </div>
          </div>
        </ScrollReveal>
      ))}
    </section>
  );
}
