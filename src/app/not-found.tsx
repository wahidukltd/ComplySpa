import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold text-[#000000]">404</h1>
      <p className="text-sm text-[rgba(0,0,0,0.55)]">This page doesn&apos;t exist.</p>
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "default" }), "")}
      >
        Go home
      </Link>
    </div>
  );
}
