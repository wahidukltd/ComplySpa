"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RefreshButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="ml-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
    >
      <RefreshCw className="size-3" />
      Refresh
    </button>
  );
}
