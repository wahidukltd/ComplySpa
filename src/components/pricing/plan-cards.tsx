"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

const PLANS = [
  {
    name: "Solo",
    monthly: 29,
    annual: 290,
    description: "For independent practitioners",
    features: [
      "5 staff members",
      "50 credentials",
      "Email expiration alerts",
      "Basic compliance reports",
      "1 user",
    ],
    popular: false,
  },
  {
    name: "Practice",
    monthly: 49,
    annual: 490,
    description: "For growing med spas",
    features: [
      "15 staff members",
      "300 credentials",
      "Email expiration alerts",
      "Audit-ready reports",
      "Inspection-readiness engine",
      "3 users",
    ],
    popular: true,
  },
  {
    name: "Multi-Location",
    monthly: 79,
    annual: 790,
    description: "For multi-location operations",
    features: [
      "50 staff members",
      "1000 credentials",
      "All Practice features",
      "5 locations",
      "10 users",
      "API access",
      "White-label reports",
    ],
    popular: false,
  },
];

export function PlanCards() {
  const [annual, setAnnual] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-8">
      {/* Toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={cn("text-sm", !annual && "font-medium text-foreground", annual && "text-muted-foreground")}>
          Monthly
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className="relative h-6 w-11 rounded-full bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Toggle annual pricing"
          aria-pressed={annual}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-primary transition-transform",
              annual ? "translate-x-5" : "translate-x-0.5"
            )}
          />
        </button>
        <span className={cn("text-sm", annual && "font-medium text-foreground", !annual && "text-muted-foreground")}>
          Annual <span className="text-xs text-muted-foreground">(2 months free)</span>
        </span>
      </div>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan, i) => (
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
                    key={annual ? "annual" : "monthly"}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-4xl font-bold xl:text-5xl"
                  >
                    ${annual ? plan.annual : plan.monthly}
                  </motion.span>
                  <span className="text-sm text-muted-foreground">
                    /{annual ? "year" : "month"}
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
                <Link
                  href="/sign-up"
                  className={cn(
                    buttonVariants({ variant: plan.popular ? "default" : "outline" }),
                    "w-full"
                  )}
                >
                  Start free trial
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        HCP charges $3,000/year for general healthcare compliance. Same coverage, 88% less — and built specifically for med spas.
      </p>
    </div>
  );
}
