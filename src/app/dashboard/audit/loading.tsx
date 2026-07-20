import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 mt-2" />
      </div>

      <section className="rounded-lg border p-6" style={{ borderColor: "#D9B7A7" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </section>

      <section className="rounded-lg border p-6" style={{ borderColor: "#D9B7A7" }}>
        <Skeleton className="h-6 w-32 mb-4" />
        <Skeleton className="h-40 w-full" />
      </section>
    </div>
  );
}
