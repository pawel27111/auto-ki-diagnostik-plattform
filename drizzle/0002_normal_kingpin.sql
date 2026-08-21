-- Data migration ---------------------------------------------------------
-- The previous schema stored readings as free-form strings ("92°C",
-- "1250 rpm", "0.45 V"). Strip everything except digits, sign and decimal
-- point so the column type changes below neither truncate silently nor fail
-- under strict mode. Requires MySQL 8.0+ for REGEXP_REPLACE.
UPDATE `diagnostics` SET `engineTemperature` = NULLIF(REGEXP_REPLACE(`engineTemperature`, '[^0-9.-]', ''), '') WHERE `engineTemperature` IS NOT NULL;--> statement-breakpoint
UPDATE `diagnostics` SET `rpm` = NULLIF(REGEXP_REPLACE(`rpm`, '[^0-9-]', ''), '') WHERE `rpm` IS NOT NULL;--> statement-breakpoint
UPDATE `diagnostics` SET `speed` = NULLIF(REGEXP_REPLACE(`speed`, '[^0-9-]', ''), '') WHERE `speed` IS NOT NULL;--> statement-breakpoint
UPDATE `diagnostics` SET `fuelPressure` = NULLIF(REGEXP_REPLACE(`fuelPressure`, '[^0-9.-]', ''), '') WHERE `fuelPressure` IS NOT NULL;--> statement-breakpoint
UPDATE `diagnostics` SET `oxygenSensor` = NULLIF(REGEXP_REPLACE(`oxygenSensor`, '[^0-9.-]', ''), '') WHERE `oxygenSensor` IS NOT NULL;--> statement-breakpoint
UPDATE `obdParameters` SET `value` = COALESCE(NULLIF(REGEXP_REPLACE(`value`, '[^0-9.-]', ''), ''), '0');--> statement-breakpoint
UPDATE `obdParameters` SET `minValue` = NULLIF(REGEXP_REPLACE(`minValue`, '[^0-9.-]', ''), '') WHERE `minValue` IS NOT NULL;--> statement-breakpoint
UPDATE `obdParameters` SET `maxValue` = NULLIF(REGEXP_REPLACE(`maxValue`, '[^0-9.-]', ''), '') WHERE `maxValue` IS NOT NULL;--> statement-breakpoint
-- Orphan cleanup: the previous schema had no foreign keys, so rows may point
-- at parents that no longer exist. Remove them before the constraints land.
DELETE FROM `obdParameters` WHERE `diagnosticId` NOT IN (SELECT `id` FROM `diagnostics`);--> statement-breakpoint
DELETE FROM `errorCodes` WHERE `diagnosticId` NOT IN (SELECT `id` FROM `diagnostics`);--> statement-breakpoint
DELETE FROM `diagnosticReports` WHERE `diagnosticId` NOT IN (SELECT `id` FROM `diagnostics`);--> statement-breakpoint
DELETE FROM `diagnostics` WHERE `vehicleId` NOT IN (SELECT `id` FROM `vehicles`) OR `userId` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
UPDATE `diagnostics` SET `obdDeviceId` = NULL WHERE `obdDeviceId` IS NOT NULL AND `obdDeviceId` NOT IN (SELECT `id` FROM `obdDevices`);--> statement-breakpoint
DELETE FROM `vehicles` WHERE `userId` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
DELETE FROM `obdDevices` WHERE `userId` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
UPDATE `diagnostics` SET `errorCount` = 0 WHERE `errorCount` IS NULL;--> statement-breakpoint
UPDATE `diagnostics` SET `warningCount` = 0 WHERE `warningCount` IS NULL;--> statement-breakpoint
-- Schema migration --------------------------------------------------------
ALTER TABLE `vehicles` DROP INDEX `vehicles_vin_unique`;--> statement-breakpoint
ALTER TABLE `diagnostics` MODIFY COLUMN `errorCount` int NOT NULL;--> statement-breakpoint
ALTER TABLE `diagnostics` MODIFY COLUMN `warningCount` int NOT NULL;--> statement-breakpoint
ALTER TABLE `diagnostics` MODIFY COLUMN `engineTemperature` decimal(6,2);--> statement-breakpoint
ALTER TABLE `diagnostics` MODIFY COLUMN `rpm` int;--> statement-breakpoint
ALTER TABLE `diagnostics` MODIFY COLUMN `speed` int;--> statement-breakpoint
ALTER TABLE `diagnostics` MODIFY COLUMN `fuelPressure` decimal(8,2);--> statement-breakpoint
ALTER TABLE `diagnostics` MODIFY COLUMN `oxygenSensor` decimal(5,3);--> statement-breakpoint
ALTER TABLE `errorCodes` MODIFY COLUMN `isResolved` boolean NOT NULL;--> statement-breakpoint
ALTER TABLE `errorCodes` MODIFY COLUMN `isResolved` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `obdDevices` MODIFY COLUMN `isActive` boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `obdParameters` MODIFY COLUMN `value` decimal(12,4) NOT NULL;--> statement-breakpoint
ALTER TABLE `obdParameters` MODIFY COLUMN `minValue` decimal(12,4);--> statement-breakpoint
ALTER TABLE `obdParameters` MODIFY COLUMN `maxValue` decimal(12,4);--> statement-breakpoint
ALTER TABLE `obdParameters` MODIFY COLUMN `isNormal` boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `obdParameters` ADD `isSimulated` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_userId_vin_unique` UNIQUE(`userId`,`vin`);--> statement-breakpoint
ALTER TABLE `diagnosticReports` ADD CONSTRAINT `diagnosticReports_diagnosticId_diagnostics_id_fk` FOREIGN KEY (`diagnosticId`) REFERENCES `diagnostics`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `diagnostics` ADD CONSTRAINT `diagnostics_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `diagnostics` ADD CONSTRAINT `diagnostics_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `diagnostics` ADD CONSTRAINT `diagnostics_obdDeviceId_obdDevices_id_fk` FOREIGN KEY (`obdDeviceId`) REFERENCES `obdDevices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `errorCodes` ADD CONSTRAINT `errorCodes_diagnosticId_diagnostics_id_fk` FOREIGN KEY (`diagnosticId`) REFERENCES `diagnostics`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obdDevices` ADD CONSTRAINT `obdDevices_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `obdParameters` ADD CONSTRAINT `obdParameters_diagnosticId_diagnostics_id_fk` FOREIGN KEY (`diagnosticId`) REFERENCES `diagnostics`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `diagnosticReports_diagnosticId_idx` ON `diagnosticReports` (`diagnosticId`);--> statement-breakpoint
CREATE INDEX `diagnostics_vehicleId_idx` ON `diagnostics` (`vehicleId`);--> statement-breakpoint
CREATE INDEX `diagnostics_userId_idx` ON `diagnostics` (`userId`);--> statement-breakpoint
CREATE INDEX `diagnostics_obdDeviceId_idx` ON `diagnostics` (`obdDeviceId`);--> statement-breakpoint
CREATE INDEX `diagnostics_startedAt_idx` ON `diagnostics` (`startedAt`);--> statement-breakpoint
CREATE INDEX `errorCodes_diagnosticId_idx` ON `errorCodes` (`diagnosticId`);--> statement-breakpoint
CREATE INDEX `errorCodes_code_idx` ON `errorCodes` (`code`);--> statement-breakpoint
CREATE INDEX `obdDevices_userId_idx` ON `obdDevices` (`userId`);--> statement-breakpoint
CREATE INDEX `obdParameters_diagnosticId_idx` ON `obdParameters` (`diagnosticId`);--> statement-breakpoint
CREATE INDEX `obdParameters_timestamp_idx` ON `obdParameters` (`timestamp`);--> statement-breakpoint
CREATE INDEX `obdParameters_diagnosticId_parameterId_idx` ON `obdParameters` (`diagnosticId`,`parameterId`);--> statement-breakpoint
CREATE INDEX `vehicles_userId_idx` ON `vehicles` (`userId`);