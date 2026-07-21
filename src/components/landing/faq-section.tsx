import { ScrollReveal } from "./scroll-reveal";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "How does the 14-day free trial work?",
    a: "Full access to all Practice plan features. No credit card required. Your data is preserved for 30 days after the trial ends.",
  },
  {
    q: "What happens after my trial ends?",
    a: "Your account switches to read-only mode for 30 days. Subscribe to a paid plan anytime during that window to restore full access. After 30 days, your account is deactivated.",
  },
  {
    q: "Do you store patient health information (PHI)?",
    a: "No. We track professional credentials — license numbers, expiration dates, certification types. No patient records are stored.",
  },
  {
    q: "Which states do you support?",
    a: "All 50 states. Twelve credential types are pre-loaded for US med spas. You can add custom credential types for your jurisdiction.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your dashboard settings. Your data is preserved based on your plan's retention policy.",
  },
  {
    q: "Do you offer SMS alerts?",
    a: "Email only. SMS was removed to keep costs at zero for clinics. Email provides a paper trail for audits and handles detailed information better.",
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-20 scroll-mt-20">
      <ScrollReveal>
        <h2 className="text-center text-3xl font-bold tracking-tight" style={{ color: "#3D2A25" }}>
          Frequently asked questions
        </h2>
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <Accordion multiple={false} className="mt-8">
          {FAQS.map((faq) => (
            <AccordionItem key={faq.q} value={faq.q}>
              <AccordionTrigger style={{ color: "#3D2A25" }}>
                {faq.q}
              </AccordionTrigger>
              <AccordionContent style={{ color: "#8B7D78" }}>
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollReveal>
    </section>
  );
}
