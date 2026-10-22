// SPDX-License-Identifier: MIT
// The query behind the activity log: the filters the screen offers, the real
// total and the window of events it returns.
//
// The screen used to receive the 300 most recent events and nothing else, and
// it presented that number as the total of the log ("305 eventos" read as
// "300 eventos"). Two things were wrong with it: the count was a lie (it was
// the size of the window, not the size of the log) and the events older than
// the window could not be reached at all — not to be read, and not to be
// reverted, which is what the screen promises ("reversión por snapshots").
//
// So the query lives here, separated from the server function that carries it:
// the filters, the escaping of the search term and the pagination are worth
// testing on their own, without a server function and without a browser.

import { and, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import type { Db } from "./db.server";
import type { PendingAction } from "./ee.server";
import { pendingActionSchema } from "./ee.server";
import { hasTerm, LIKE_ESCAPE, likePattern } from "./activity-page";

/** The filters the activity screen offers. Anything omitted matches everything. */
export type ActivityFilter = {
  actor?: string;
  type?: string;
  expertId?: string;
  status?: string;
  /** Free text, matched against the summary, the type, the actor and the id. */
  q?: string;
};

/** One event as the screen shows it. */
export type ActivityRow = {
  id: string;
  ts: string;
  actor: string;
  actor_name: string;
  type: string;
  expert_id: string;
  status: string;
  summary: string;
  sources: string[];
  duration_ms: number | null;
  hasSnapshot: boolean;
  /**
   * The action waiting for a decision, when there is one.
   *
   * It is read with the same schema the decision uses (`pendingActionSchema`),
   * so what the screen shows is exactly what `decideAction` will execute, and
   * a snapshot nobody wrote by hand cannot put a shape there that the server
   * would not accept.
   */
  pending: PendingAction | null;
};

/** The window of events and how many the log holds in total. */
export type ActivityPage = {
  events: ActivityRow[];
  /** How many events the log holds, filters included. Not the size of the window. */
  total: number;
  /** How many events the window returned. */
  returned: number;
  /** True when there are older events past the window. */
  hasMore: boolean;
  /**
   * The offset of the next window, or null when the log has no more.
   *
   * The next window starts where this one ended, so the pages tile the log
   * without repeating or skipping an event.
   */
  nextOffset: number | null;
};

/**
 * The columns the search box looks at: the summary, the type, the actor's
 * name and the id. The id is what the owner copies when it asks about one
 * event, so searching for it has to work.
 */
const SEARCH_COLUMNS = [
  schema.activity.summary,
  schema.activity.type,
  schema.activity.actorName,
  schema.activity.id,
] as const;

/**
 * The `LIKE` condition of a search, over the columns above.
 *
 * `casefold` folds the whole Unicode range (SQLite's `lower()` only folds
 * ASCII, so "Configuración" would never match a search for "configuración",
 * and neither would "INTEGRACIÓN" match "integración").
 */
export function searchCondition(term: string): SQL | undefined {
  const pattern = likePattern(term);
  return or(
    ...SEARCH_COLUMNS.map(
      (column) => sql`casefold(${column}) like ${pattern} escape ${LIKE_ESCAPE}`,
    ),
  );
}

/**
 * The `WHERE` of the activity query: every filter that is set, and nothing
 * more. A filter that is an empty string is not a filter.
 */
export function filterCondition(filter: ActivityFilter): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];
  if (filter.actor) clauses.push(eq(schema.activity.actor, filter.actor));
  if (filter.type) clauses.push(eq(schema.activity.type, filter.type));
  if (filter.expertId) clauses.push(eq(schema.activity.expertId, filter.expertId));
  if (filter.status) clauses.push(eq(schema.activity.status, filter.status));
  if (hasTerm(filter.q)) clauses.push(searchCondition(filter.q));
  const kept = clauses.filter((c): c is SQL => c !== undefined);
  if (!kept.length) return undefined;
  return kept.length === 1 ? kept[0] : and(...kept);
}

/**
 * The window of events the screen shows, and how many the log holds.
 *
 * The total comes from a real `COUNT(*)` with the same filters, so the number
 * on screen is the number of events that match, not the number that happened
 * to fit in the window. `offset` is what walks the window towards the older
 * events, so the oldest one in the log is reachable — and revertible, because
 * the screen asks for the snapshot of the event it shows.
 */
export function queryActivity(
  orm: Db,
  filter: ActivityFilter,
  offset: number,
  limit: number,
): ActivityPage {
  const where = filterCondition(filter);
  const totalRow = orm.select({ n: count() }).from(schema.activity).where(where).all();
  const total = Number(totalRow[0]?.n ?? 0);

  const query = orm.select().from(schema.activity);
  const rows = (
    where
      ? query.where(where).orderBy(desc(schema.activity.ts)).limit(limit).offset(offset).all()
      : query.orderBy(desc(schema.activity.ts)).limit(limit).offset(offset).all()
  ) as (typeof schema.activity.$inferSelect)[];

  const events: ActivityRow[] = rows.map((a) => ({
    id: a.id,
    ts: a.ts,
    actor: a.actor,
    actor_name: a.actorName,
    type: a.type,
    expert_id: a.expertId,
    status: a.status,
    summary: a.summary,
    sources: a.sources,
    duration_ms: a.durationMs,
    hasSnapshot: !!(a.snapshot as { entries?: unknown[] } | null)?.entries?.length,
    pending: readPending(a.snapshot),
  }));

  return {
    events,
    total,
    returned: events.length,
    hasMore: offset + events.length < total,
    nextOffset: offset + events.length < total ? offset + events.length : null,
  };
}

/**
 * The action waiting for a decision, read with the schema the decision uses.
 *
 * A snapshot written by an older version (or by hand) can hold a `pending`
 * that is not one of the two actions the server knows how to execute. It is
 * not shown as a decision the user can take, because taking it would fail.
 */
function readPending(snapshot: unknown): PendingAction | null {
  const raw = (snapshot as { pending?: unknown } | null)?.pending;
  if (raw == null) return null;
  const parsed = pendingActionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
