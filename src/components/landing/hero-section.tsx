"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Hero3D = dynamic(() => import("@/components/landing/hero-3d").then(m => m.Hero3D), { ssr: false });

export function HeroSection() {
  return (
    <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
      {/* 3D background — desktop only */}
      <div className="hidden md:block">
        <Hero3D />
      </div>
      {/* Static gradient — mobile only */}
      <div
        className="absolute inset-0 -z-10 md:hidden"
        style={{ background: "linear-gradient(135deg, #FFF8F2 0%, #B5CED6 50%, #6E97A7 100%)" }}
        aria-hidden="true"
      />
      {/* Foreground */}
      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center">
        <h1
          className="text-4xl font-bold tracking-tight md:text-5xl"
          style={{ color: "#000000" }}
        >
          Track every credential. Never miss an expiration. Pass any inspection.
        </h1>
        <p className="mt-4 text-lg" style={{ color: "rgba(0,0,0,0.55)" }}>
          Purpose-built for independent medical spas. Get alerted before licenses lapse, generate audit-ready reports, and know your readiness score.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "transition-opacity duration-200 hover:opacity-90"
            )}
          >
            Start free trial
          </Link>
          <a
            href="#how-it-works"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "transition-opacity duration-200 hover:opacity-90"
            )}
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}
