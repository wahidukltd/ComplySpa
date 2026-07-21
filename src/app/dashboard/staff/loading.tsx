import { Skeleton } from "@/components/ui/skeleton";

export default function StaffListLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-48 mt-1" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
