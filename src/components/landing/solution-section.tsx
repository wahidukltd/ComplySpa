import { ScrollReveal } from "./scroll-reveal";
import { ShieldCheck, Bell, ClipboardCheck } from "lucide-react";

const BENEFITS = [
  { icon: ShieldCheck, text: "Credentials tracked with expiration countdown" },
  { icon: Bell, text: "Alerts delivered by email at 90/60/30/7 days" },
  { icon: ClipboardCheck, text: "Readiness score auto-calculated from your data" },
];

export function SolutionSection() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: "#000000" }}>
            Compliance tracking that mirrors what inspectors actually ask for.
          </h2>
          <p className="mt-4" style={{ color: "rgba(0,0,0,0.55)" }}>
            Twelve credential types pre-loaded. Automated alerts at 90, 60, 30, and 7 days. A 7-point readiness checklist that auto-fills from your data.
          </p>
          <ul className="mt-6 space-y-3">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <Icon className="size-5 shrink-0" style={{ color: "#6E97A7" }} aria-hidden="true" />
                <span style={{ color: "#000000" }}>{text}</span>
              </li>
            ))}
          </ul>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div
            className="flex aspect-video items-center justify-center rounded-xl border"
            style={{ borderColor: "rgba(0,0,0,0.12)", backgroundColor: "#F0F4F5" }}
          >
            <span className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
              Dashboard preview
            </span>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
