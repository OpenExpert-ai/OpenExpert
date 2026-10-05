-- SPDX-License-Identifier: MIT
-- 0005: drop the autonomous processes table.
--
-- The processes catalogue was narrative scaffolding: "running" a process only
-- incremented a counter, the trigger was descriptive (no scheduler) and the
-- stages were never executed. The feature is removed until it can be built for
-- real; see the roadmap. Drops the table for existing databases.
DROP TABLE IF EXISTS processes;
