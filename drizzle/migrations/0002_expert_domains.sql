-- SPDX-License-Identifier: MIT
-- 0002: explicit per-Expert business domains.
--
-- Isolation used to compare the Expert id with the domain name (or accept the
-- literal id "general"), which left every user-created Expert with no data
-- access. Domains are now a stored array. The baseline init.sql does not carry
-- the column on purpose: this migration is what adds it for both fresh and
-- existing databases.
ALTER TABLE experts ADD COLUMN domains TEXT NOT NULL DEFAULT '[]';

-- Backfill the seeded Experts so behaviour is unchanged for them. `general`
-- sees every domain; the others keep their single domain. User-created Experts
-- start with no domains and can be granted some from the UI.
UPDATE experts
SET domains = CASE
  WHEN id = 'general' THEN '["ventas","finanzas","marketing","general"]'
  WHEN id IN ('ventas', 'finanzas', 'marketing') THEN '["' || id || '"]'
  ELSE '[]'
END;
