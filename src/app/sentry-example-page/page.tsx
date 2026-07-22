"use client";

import * as Sentry from "@sentry/nextjs";
import { useState } from "react";

export default function SentryExamplePage() {
  const [error, setError] = useState<string | null>(null);

  async function throwError() {
    setError(null);
    try {
      (window as any).myUndefinedFunction();
    } catch (e) {
      Sentry.captureException(e);
      setError("Error sent to Sentry. Check your Sentry Issues dashboard.");
    }
  }

  async function throwApiError() {
    setError(null);
    const res = await fetch("/api/sentry-example-api");
    const data = await res.json();
    setError(data.message || "API error sent to Sentry.");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <h1 className="text-2xl font-semibold">Sentry Test Page</h1>
      <p className="text-sm text-muted-foreground">
        Click the buttons below to trigger test errors and verify Sentry is working.
      </p>
      <div className="flex gap-4">
        <button
          onClick={throwError}
          className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90"
        >
          Throw Sample Error
        </button>
        <button
          onClick={throwApiError}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Trigger API Error
        </button>
      </div>
      {error && <p className="text-sm text-green-600">{error}</p>}
    </div>
  );
}
