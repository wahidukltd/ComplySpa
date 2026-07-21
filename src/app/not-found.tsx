import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold" style={{ color: "#3D2A25" }}>404</h1>
      <p className="text-sm" style={{ color: "#8B7D78" }}>This page doesn&apos;t exist.</p>
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "default" }), "")}
      >
        Go home
      </Link>
    </div>
  );
}
