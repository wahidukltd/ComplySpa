import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-sm"
      style={{ borderColor: "#D9B7A7", backgroundColor: "rgba(255, 248, 242, 0.9)" }}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded" />
          <span className="text-sm font-semibold" style={{ color: "#3D2A25" }}>
            Med Spa Compliance
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm transition-colors hover:underline"
              style={{ color: "#8B7D78" }}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="hidden text-sm transition-colors hover:underline sm:inline"
            style={{ color: "#8B7D78" }}
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            Start free trial
          </Link>
        </div>
      </nav>
    </header>
  );
}
