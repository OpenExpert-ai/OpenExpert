-- SPDX-License-Identifier: MIT
-- 0004: drop the example business data shipped by earlier versions.
--
-- OpenExpert used to seed deals, invoices, campaigns and accounts with
-- invented companies so the assistant had figures to talk about. That made the
-- assistant look like it was reading real connectors (Pipedrive, Holded, Meta)
-- when it was reading local fixtures. The app now ships empty and only shows
-- real figures once a connector or an import provides them.
--
-- These tables have no user-facing write path yet, so a full delete only
-- removes the fixtures. Runs once (tracked by PRAGMA user_version).
DELETE FROM deals;
DELETE FROM invoices;
DELETE FROM campaigns;
DELETE FROM accounts;
