-- Restore the DEFAULT 0 that migration 0002 silently dropped.
--
-- MySQL's MODIFY COLUMN replaces the whole column definition, so
--   ALTER TABLE `diagnostics` MODIFY COLUMN `errorCount` int NOT NULL;
-- removed the `DEFAULT 0` that 0001 had set. The Drizzle schema still
-- declares .default(0), so every insert that leaves the counters out — which
-- is every insert, they are only filled in once a scan finishes — was sent as
-- `VALUES (..., default, default, ...)` and rejected under strict mode with
-- "Field 'errorCount' doesn't have a default value". Starting any diagnostic
-- failed on a database built from these migrations.
--
-- 0002 got this right for `isResolved`, `isActive` and `isNormal`, which is
-- why only these two columns are affected.
ALTER TABLE `diagnostics` MODIFY COLUMN `errorCount` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `diagnostics` MODIFY COLUMN `warningCount` int NOT NULL DEFAULT 0;
