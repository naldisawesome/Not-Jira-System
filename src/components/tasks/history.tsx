import { ActivityFeed } from "@/components/activity-feed";
import type { ActivityRow } from "@/server/stats";
export type HistoryItem = ActivityRow;
export function ActivityFeedClient({ items }: { items: HistoryItem[] }) {
  return <ActivityFeed items={items} />;
}
