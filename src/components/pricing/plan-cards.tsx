"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLAN_ANNUAL_PRICE, PLAN_MONTHLY_PRICE, type SubscriptionInterval } from "@/lib/billing/copy";
import Link from "next/link";

interface Props {
  checkoutUrls?: Record<string, string> | null;
}

const PLANS = [
  {
    id: "solo",
    name: "Solo",
    description: "For independent practitioners",
    features: [
      "5 staff members",
      "50 credentials",
      "Email expiration alerts",
      "Basic compliance reports (email to yourself)",
      "1 user",
    ],
    popular: false,
  },
  {
    id: "practice",
    name: "Practice",
    description: "For growing med spas",
    features: [
      "15 staff members",
      "300 credentials",
      "Email expiration alerts",
      "Audit-ready reports (email to yourself)",
      "Inspection-readiness engine",
      "3 users",
    ],
    popular: true,
  },
];

// Real interval selector (plan 2026-08-08 §4.7): monthly AND annual are both
// first-class, per the four-product subscription architecture. The displayed
// price ALWAYS matches what the checkout will charge (same interval, same
// product). Subscribe buttons render only for products whose price id is
// configured and verified (checkoutUrls keyed `${plan}_${interval}`); an
// unavailable interval shows a disabled button, never a fake checkout link.
export function PlanCards({ checkoutUrls }: Props) {
  const [interval, setInterval] = useState<SubscriptionInterval>("monthly");
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-8">
      {/* Interval toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={cn("text-sm", interval === "monthly" && "font-medium text-foreground", interval === "annual" && "text-muted-foreground")}>
          Monthly
        </span>
        <button
          onClick={() => setInterval(interval === "monthly" ? "annual" : "monthly")}
          className="relative h-6 w-11 rounded-full bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Toggle annual pricing"
          aria-pressed={interval === "annual"}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-primary transition-transform",
              interval === "annual" ? "translate-x-5" : "translate-x-0.5"
            )}
          />
        </button>
        <span className={cn("text-sm", interval === "annual" && "font-medium text-foreground", interval === "monthly" && "text-muted-foreground")}>
          Annual <span className="text-xs text-muted-foreground">(2 months free)</span>
        </span>
      </div>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan, i) => {
          const monthly = PLAN_MONTHLY_PRICE[plan.id as keyof typeof PLAN_MONTHLY_PRICE];
          const annual = PLAN_ANNUAL_PRICE[plan.id as keyof typeof PLAN_ANNUAL_PRICE];
          const price = interval === "annual" ? annual : monthly;
          const url = checkoutUrls?.[`${plan.id}_${interval}`];
          return (
            <motion.div
              key={plan.name}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: shouldReduceMotion ? 0 : i * 0.1 }}
            >
              <Card
                className={cn(
                  "relative h-full",
                  plan.popular && "border-primary border-2"
                )}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-xl xl:text-2xl">{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground xl:text-base">{plan.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline gap-1" aria-live="polite" aria-atomic="true">
                    <motion.span
                      key={interval}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-4xl font-bold xl:text-5xl"
                    >
                      ${price}
                    </motion.span>
                    <span className="text-sm text-muted-foreground">
                      /{interval === "annual" ? "year" : "month"}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <span className="text-primary" aria-hidden="true">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/sign-up?plan=${plan.id}`}
                      className={cn(
                        buttonVariants({ variant: plan.popular ? "default" : "outline" }),
                        "w-full"
                      )}
                    >
                      Start {plan.name} free trial
                    </Link>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: "ghost" }),
                          "w-full text-xs"
                        )}
                      >
                        Subscribe now &rarr;
                      </a>
                    ) : (
                      // Unavailable product (B7): never render a link to a
                      // nonexistent product and never let a sign-up fallback
                      // masquerade as a subscription — the interval stays
                      // disabled until its Polar product is configured.
                      <button
                        disabled
                        title="This billing option isn't available yet."
                        className={cn(
                          buttonVariants({ variant: "ghost" }),
                          "w-full cursor-not-allowed text-xs opacity-50"
                        )}
                      >
                        Subscribe now
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        HCP charges $3,000/year for general healthcare compliance. Same coverage, 88% less — and built specifically for med spas.
      </p>
    </div>
  );
}
