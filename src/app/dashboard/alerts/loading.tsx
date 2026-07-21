import { Skeleton } from "@/components/ui/skeleton";

export default function AlertsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-64 mt-1" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
