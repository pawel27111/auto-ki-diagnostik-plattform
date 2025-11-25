import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Vehicles table - stores information about vehicles
export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  vin: varchar("vin", { length: 17 }).notNull().unique(),
  make: varchar("make", { length: 50 }).notNull(),
  model: varchar("model", { length: 50 }).notNull(),
  year: int("year").notNull(),
  engineType: varchar("engineType", { length: 50 }),
  fuelType: varchar("fuelType", { length: 50 }),
  licensePlate: varchar("licensePlate", { length: 20 }),
  mileage: int("mileage"),
  status: mysqlEnum("status", ["active", "inactive", "warning", "error"]).default("active").notNull(),
  lastDiagnosisAt: timestamp("lastDiagnosisAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

// OBD Devices table - stores connected OBD devices
export const obdDevices = mysqlTable("obdDevices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  deviceName: varchar("deviceName", { length: 100 }).notNull(),
  deviceType: mysqlEnum("deviceType", ["elm327", "canAdapter", "wifi", "bluetooth"]).notNull(),
  connectionString: varchar("connectionString", { length: 255 }),
  isActive: int("isActive").default(1).notNull(),
  lastConnectedAt: timestamp("lastConnectedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ObdDevice = typeof obdDevices.$inferSelect;
export type InsertObdDevice = typeof obdDevices.$inferInsert;

// Diagnostics table - stores diagnostic sessions
export const diagnostics = mysqlTable("diagnostics", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicleId").notNull(),
  userId: int("userId").notNull(),
  obdDeviceId: int("obdDeviceId"),
  diagnosticType: mysqlEnum("diagnosticType", ["full_scan", "quick_scan", "custom", "real_time"]).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed", "cancelled"]).default("running").notNull(),
  errorCount: int("errorCount").default(0),
  warningCount: int("warningCount").default(0),
  mileageAtDiagnosis: int("mileageAtDiagnosis"),
  engineTemperature: varchar("engineTemperature", { length: 50 }),
  rpm: varchar("rpm", { length: 50 }),
  speed: varchar("speed", { length: 50 }),
  fuelPressure: varchar("fuelPressure", { length: 50 }),
  oxygenSensor: varchar("oxygenSensor", { length: 50 }),
  diagnosticData: text("diagnosticData"),
  notes: text("notes"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Diagnostic = typeof diagnostics.$inferSelect;
export type InsertDiagnostic = typeof diagnostics.$inferInsert;

// Error Codes (DTC) table - stores detected error codes
export const errorCodes = mysqlTable("errorCodes", {
  id: int("id").autoincrement().primaryKey(),
  diagnosticId: int("diagnosticId").notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  description: text("description"),
  severity: mysqlEnum("severity", ["info", "warning", "error", "critical"]).notNull(),
  system: varchar("system", { length: 50 }),
  isResolved: int("isResolved").default(0),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ErrorCode = typeof errorCodes.$inferSelect;
export type InsertErrorCode = typeof errorCodes.$inferInsert;

// OBD Parameters table - stores real-time parameter readings
export const obdParameters = mysqlTable("obdParameters", {
  id: int("id").autoincrement().primaryKey(),
  diagnosticId: int("diagnosticId").notNull(),
  parameterId: varchar("parameterId", { length: 10 }).notNull(),
  parameterName: varchar("parameterName", { length: 100 }).notNull(),
  value: varchar("value", { length: 100 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  minValue: varchar("minValue", { length: 50 }),
  maxValue: varchar("maxValue", { length: 50 }),
  isNormal: int("isNormal").default(1),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type ObdParameter = typeof obdParameters.$inferSelect;
export type InsertObdParameter = typeof obdParameters.$inferInsert;

// Diagnostic Reports table - stores generated reports
export const diagnosticReports = mysqlTable("diagnosticReports", {
  id: int("id").autoincrement().primaryKey(),
  diagnosticId: int("diagnosticId").notNull(),
  reportType: mysqlEnum("reportType", ["summary", "detailed", "pdf", "csv"]).notNull(),
  reportData: text("reportData"),
  recommendations: text("recommendations"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
});

export type DiagnosticReport = typeof diagnosticReports.$inferSelect;
export type InsertDiagnosticReport = typeof diagnosticReports.$inferInsert;