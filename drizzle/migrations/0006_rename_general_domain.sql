-- SPDX-License-Identifier: MIT
-- 0006: rename the "general" business domain to "clientes".
--
-- `general` was both an Expert id (the all-seeing one) and a domain (accounts /
-- churn), which was confusing. The domain is now `clientes`; `general` only
-- means the transversal Expert. Rewrites the stored domain arrays.
UPDATE experts
SET domains = REPLACE(domains, '"general"', '"clientes"')
WHERE domains LIKE '%"general"%';
