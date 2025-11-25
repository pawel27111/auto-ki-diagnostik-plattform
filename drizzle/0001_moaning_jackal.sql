CREATE TABLE `diagnosticReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`diagnosticId` int NOT NULL,
	`reportType` enum('summary','detailed','pdf','csv') NOT NULL,
	`reportData` text,
	`recommendations` text,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `diagnosticReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `diagnostics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`userId` int NOT NULL,
	`obdDeviceId` int,
	`diagnosticType` enum('full_scan','quick_scan','custom','real_time') NOT NULL,
	`status` enum('running','completed','failed','cancelled') NOT NULL DEFAULT 'running',
	`errorCount` int DEFAULT 0,
	`warningCount` int DEFAULT 0,
	`mileageAtDiagnosis` int,
	`engineTemperature` varchar(50),
	`rpm` varchar(50),
	`speed` varchar(50),
	`fuelPressure` varchar(50),
	`oxygenSensor` varchar(50),
	`diagnosticData` text,
	`notes` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diagnostics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `errorCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`diagnosticId` int NOT NULL,
	`code` varchar(10) NOT NULL,
	`description` text,
	`severity` enum('info','warning','error','critical') NOT NULL,
	`system` varchar(50),
	`isResolved` int DEFAULT 0,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `errorCodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `obdDevices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceName` varchar(100) NOT NULL,
	`deviceType` enum('elm327','canAdapter','wifi','bluetooth') NOT NULL,
	`connectionString` varchar(255),
	`isActive` int NOT NULL DEFAULT 1,
	`lastConnectedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `obdDevices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `obdParameters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`diagnosticId` int NOT NULL,
	`parameterId` varchar(10) NOT NULL,
	`parameterName` varchar(100) NOT NULL,
	`value` varchar(100) NOT NULL,
	`unit` varchar(50),
	`minValue` varchar(50),
	`maxValue` varchar(50),
	`isNormal` int DEFAULT 1,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `obdParameters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`vin` varchar(17) NOT NULL,
	`make` varchar(50) NOT NULL,
	`model` varchar(50) NOT NULL,
	`year` int NOT NULL,
	`engineType` varchar(50),
	`fuelType` varchar(50),
	`licensePlate` varchar(20),
	`mileage` int,
	`status` enum('active','inactive','warning','error') NOT NULL DEFAULT 'active',
	`lastDiagnosisAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicles_vin_unique` UNIQUE(`vin`)
);
