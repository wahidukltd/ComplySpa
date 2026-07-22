import { ScrollReveal } from "./scroll-reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function CTASection() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-20 text-center xl:max-w-4xl xl:px-8 xl:py-24 2xl:max-w-5xl 2xl:px-12 2xl:py-28">
      <ScrollReveal>
        <h2 className="text-3xl font-bold tracking-tight xl:text-4xl 2xl:text-5xl" style={{ color: "#000000" }}>
          Start your 14-day free trial.
        </h2>
        <p className="mx-auto mt-3 max-w-md" style={{ color: "rgba(0,0,0,0.55)" }}>
          No credit card. Cancel anytime. Data preserved for 30 days after trial.
        </p>
        <Link
          href="/sign-up"
          className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-6")}
        >
          Start free trial
        </Link>
      </ScrollReveal>
    </section>
  );
}
