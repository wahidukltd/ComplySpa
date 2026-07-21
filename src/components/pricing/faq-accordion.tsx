"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useReducedMotion } from "motion/react";

const FAQS = [
  {
    question: "Can I switch plans?",
    answer: "Yes. Upgrade or downgrade anytime from your settings page. Changes take effect immediately.",
  },
  {
    question: "What happens after the trial?",
    answer: "Your 14-day trial includes all Practice plan features. After 14 days, choose the plan that fits your clinic. Your data is preserved for 30 days.",
  },
  {
    question: "Do you store patient health records?",
    answer: "No. We track professional credentials — license numbers, expiration dates, verification URLs. Not patient health records (PHI).",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. Cancel from your billing settings. Your data is preserved for 30 days after cancellation, then permanently deleted.",
  },
  {
    question: "How does the inspection-readiness engine work?",
    answer: "It mirrors the 7 documents state board inspectors ask for first. Three items auto-fill from your credential data. Four are manual attest. You get a readiness score from 0 to 100.",
  },
  {
    question: "Do you integrate with my EMR?",
    answer: "Not yet. We focus on compliance tracking, not scheduling or patient records. EMR integration is on the roadmap for the Multi-Location plan.",
  },
];

export function FaqAccordion() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Accordion multiple={false} className="w-full">
      {FAQS.map((faq) => (
        <AccordionItem key={faq.question} value={faq.question}>
          <AccordionTrigger className={shouldReduceMotion ? "[&[data-state=open]>svg]:rotate-0" : ""}>
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className={shouldReduceMotion ? "data-[state=open]:animate-none" : ""}>
            {faq.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
