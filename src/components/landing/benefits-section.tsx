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
    <section className="mx-auto max-w-5xl px-4 py-20 xl:max-w-6xl xl:px-8 xl:py-24 2xl:max-w-7xl 2xl:px-12 2xl:py-28">
      {ROWS.map((row, i) => (
        <ScrollReveal key={row.title} delay={i * 200}>
          <div className={`grid items-center gap-12 md:grid-cols-2 xl:gap-16 2xl:gap-20 ${i > 0 ? "mt-20" : ""}`}>
            <div
              className={`flex aspect-video items-center justify-center rounded-xl border ${row.imageFirst ? "md:order-1" : "md:order-2"}`}
              style={{ borderColor: "rgba(0,0,0,0.12)", backgroundColor: "#F0F4F5" }}
            >
              <span className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
                Product preview
              </span>
            </div>
            <div className={row.imageFirst ? "md:order-2" : "md:order-1"}>
              <h3 className="text-2xl font-bold tracking-tight xl:text-3xl 2xl:text-4xl" style={{ color: "#000000" }}>
                {row.title}
              </h3>
              <p className="mt-3" style={{ color: "rgba(0,0,0,0.55)" }}>
                {row.text}
              </p>
            </div>
          </div>
        </ScrollReveal>
      ))}
    </section>
  );
}
