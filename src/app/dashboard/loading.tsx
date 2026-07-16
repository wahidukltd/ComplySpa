import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex h-screen items-center justify-center" role="status" aria-label="Loading dashboard">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading dashboard...</span>
    </div>
  );
}
