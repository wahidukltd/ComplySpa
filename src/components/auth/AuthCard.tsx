import type { ReactNode } from "react";
import Link from "next/link";

interface AuthCardProps {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            ComplySpa
          </Link>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        {children && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            {children}
          </div>
        )}

        {footer && (
          <p className="text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}
