import { PageHeader } from "@/components/page-header";
import { BugReportForm } from "@/components/tasks/bug-report-form";
import { requireUser } from "@/server/session";

export const metadata = { title: "Report a bug" };

export default async function NewBugPage({ searchParams }: { searchParams: { project?: string } }) {
  await requireUser();
  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <PageHeader title="Report a bug" description="Screenshots make bugs 10× faster to fix — drop them in, browse, or just paste with Ctrl/⌘+V anywhere on this page." />
      <BugReportForm defaultProject={searchParams.project} />
    </div>
  );
}
