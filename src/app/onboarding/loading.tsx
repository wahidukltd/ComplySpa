import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Skeleton className="h-96 w-full max-w-2xl rounded-lg" />
    </div>
  );
}
