import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, userSettings } from "@/db/schema";
import { requireUser } from "@/server/session";
import { PageHeader } from "@/components/page-header";
import { AccountSettings } from "@/components/account-settings";

export const metadata = { title: "Account settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [[settings], tokens] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, user.id)),
    db.select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt }).from(apiTokens).where(eq(apiTokens.userId, user.id)).orderBy(desc(apiTokens.createdAt)),
  ]);
  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <PageHeader title="Account settings" description="Your profile, password, preferences and API access." />
      <AccountSettings me={{ id: user.id, name: user.name, title: user.title, email: user.email, username: user.username, role: user.role }} emailNotifications={settings?.emailNotifications ?? true} tokens={tokens} />
    </div>
  );
}
