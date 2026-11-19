import Link from "next/link";
import { LogoMark } from "@/components/shell/logo";
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <LogoMark className="size-10" />
      <h1 className="text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="text-sm text-muted-foreground">It may have been deleted, or you might not have access to it.</p>
      <Link href="/" className="mt-2 text-sm font-medium text-primary hover:underline">Back to overview</Link>
    </div>
  );
}
