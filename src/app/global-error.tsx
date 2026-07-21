"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-4">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-[28rem] text-sm text-[#8B7D78]">
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-[#3D2A25] text-[#FFF8F2] px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
