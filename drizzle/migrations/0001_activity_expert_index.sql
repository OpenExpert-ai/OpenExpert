-- SPDX-License-Identifier: MIT
-- 0001: index the activity log by Expert. The activity screen filters by
-- `expert_id`; without an index SQLite scans the whole (append-only) table.
CREATE INDEX IF NOT EXISTS activity_expert ON activity (expert_id);
