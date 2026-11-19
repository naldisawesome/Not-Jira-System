import { Skeleton } from "@/components/ui/misc";
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-72 rounded-xl lg:col-span-2" /><Skeleton className="h-72 rounded-xl" /></div>
    </div>
  );
}
