// SPDX-License-Identifier: MIT
// The footer line of an event in the activity log: id, time, duration, sources
// and the snapshot mark.
//
// It lives in its own component so it can be mounted in a test: the route
// drags in the server functions and the whole workspace, and the thing worth
// checking here is what the line shows for an event nobody timed.

import { formatDateTime, formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";

export type ActivityEventMetaProps = {
  id: string;
  ts: string;
  /** The measured duration, or null when the action was not timed. */
  duration_ms: number | null;
  sources: string[];
  hasSnapshot: boolean;
};

export function ActivityEventMeta({
  id,
  ts,
  duration_ms,
  sources,
  hasSnapshot,
}: ActivityEventMetaProps) {
  const { t, locale } = useT();
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-[0.7rem] text-muted-foreground">
      <span>{id}</span>
      <span>{formatDateTime(ts, locale)}</span>
      <span>{formatDuration(duration_ms)}</span>
      {sources.length > 0 && (
        <span>
          {t("fuentes:")} {sources.join(", ")}
        </span>
      )}
      {hasSnapshot && <span className="text-primary/80">snapshot ✓</span>}
    </div>
  );
}
