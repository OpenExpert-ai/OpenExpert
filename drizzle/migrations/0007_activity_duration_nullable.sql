-- SPDX-License-Identifier: MIT
-- 0007: the activity log stops inventing a duration.
--
-- `duration_ms` was `NOT NULL DEFAULT 300`, and `logActivity` stored
-- `e.duration_ms ?? 300`: every action nobody timed (creating an Expert, saving
-- a setting, a Drive write, a blocked injection) was filed with the number 300
-- ms, and the activity screen printed it as "0.30s". In an audit trail an
-- invented measurement reads as a real one, so the column now holds NULL when
-- there is nothing to report and the screen shows a dash.
--
-- SQLite cannot drop a NOT NULL constraint in place: the table is rebuilt. The
-- rows already stored keep their value, including the historical 300 ms ones:
-- they are not rewritten, because a past entry cannot be un-measured.
CREATE TABLE activity_new (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  type TEXT NOT NULL,
  expert_id TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  duration_ms INTEGER,
  snapshot TEXT
);

INSERT INTO activity_new (id, ts, actor, actor_name, type, expert_id, status, summary, sources, duration_ms, snapshot)
SELECT id, ts, actor, actor_name, type, expert_id, status, summary, sources, duration_ms, snapshot
FROM activity;

DROP TABLE activity;
ALTER TABLE activity_new RENAME TO activity;

-- The indexes of the old table went with it; they are recreated here.
CREATE INDEX IF NOT EXISTS activity_expert ON activity (expert_id);
CREATE INDEX IF NOT EXISTS activity_ts ON activity (ts DESC);
