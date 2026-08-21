import { relations } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";

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
export const vehicles = mysqlTable(
  "vehicles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vin: varchar("vin", { length: 17 }).notNull(),
    make: varchar("make", { length: 50 }).notNull(),
    model: varchar("model", { length: 50 }).notNull(),
    year: int("year").notNull(),
    engineType: varchar("engineType", { length: 50 }),
    fuelType: varchar("fuelType", { length: 50 }),
    licensePlate: varchar("licensePlate", { length: 20 }),
    mileage: int("mileage"),
    status: mysqlEnum("status", ["active", "inactive", "warning", "error"])
      .default("active")
      .notNull(),
    lastDiagnosisAt: timestamp("lastDiagnosisAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    // A VIN is only unique per owner: a workshop and the vehicle owner may both
    // register the same car.
    unique("vehicles_userId_vin_unique").on(table.userId, table.vin),
    index("vehicles_userId_idx").on(table.userId),
  ]
);

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

// OBD Devices table - stores connected OBD devices
export const obdDevices = mysqlTable(
  "obdDevices",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceName: varchar("deviceName", { length: 100 }).notNull(),
    deviceType: mysqlEnum("deviceType", [
      "elm327",
      "canAdapter",
      "wifi",
      "bluetooth",
    ]).notNull(),
    connectionString: varchar("connectionString", { length: 255 }),
    isActive: boolean("isActive").default(true).notNull(),
    lastConnectedAt: timestamp("lastConnectedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("obdDevices_userId_idx").on(table.userId)]
);

export type ObdDevice = typeof obdDevices.$inferSelect;
export type InsertObdDevice = typeof obdDevices.$inferInsert;

// Diagnostics table - stores diagnostic sessions
export const diagnostics = mysqlTable(
  "diagnostics",
  {
    id: int("id").autoincrement().primaryKey(),
    vehicleId: int("vehicleId")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    obdDeviceId: int("obdDeviceId").references(() => obdDevices.id, {
      onDelete: "set null",
    }),
    diagnosticType: mysqlEnum("diagnosticType", [
      "full_scan",
      "quick_scan",
      "custom",
      "real_time",
    ]).notNull(),
    status: mysqlEnum("status", ["running", "completed", "failed", "cancelled"])
      .default("running")
      .notNull(),
    errorCount: int("errorCount").default(0).notNull(),
    warningCount: int("warningCount").default(0).notNull(),
    mileageAtDiagnosis: int("mileageAtDiagnosis"),
    // Numeric readings are stored as numbers so they can be aggregated and
    // compared in SQL. Units are fixed per column and documented here.
    /** Engine coolant temperature in degrees Celsius. */
    engineTemperature: decimal("engineTemperature", {
      precision: 6,
      scale: 2,
      mode: "number",
    }),
    /** Engine speed in revolutions per minute. */
    rpm: int("rpm"),
    /** Vehicle speed in km/h. */
    speed: int("speed"),
    /** Fuel rail pressure in kPa. */
    fuelPressure: decimal("fuelPressure", {
      precision: 8,
      scale: 2,
      mode: "number",
    }),
    /** O2 sensor voltage in volts. */
    oxygenSensor: decimal("oxygenSensor", {
      precision: 5,
      scale: 3,
      mode: "number",
    }),
    diagnosticData: text("diagnosticData"),
    notes: text("notes"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("diagnostics_vehicleId_idx").on(table.vehicleId),
    index("diagnostics_userId_idx").on(table.userId),
    index("diagnostics_obdDeviceId_idx").on(table.obdDeviceId),
    index("diagnostics_startedAt_idx").on(table.startedAt),
  ]
);

export type Diagnostic = typeof diagnostics.$inferSelect;
export type InsertDiagnostic = typeof diagnostics.$inferInsert;

// Error Codes (DTC) table - stores detected error codes
export const errorCodes = mysqlTable(
  "errorCodes",
  {
    id: int("id").autoincrement().primaryKey(),
    diagnosticId: int("diagnosticId")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 10 }).notNull(),
    description: text("description"),
    severity: mysqlEnum("severity", [
      "info",
      "warning",
      "error",
      "critical",
    ]).notNull(),
    system: varchar("system", { length: 50 }),
    isResolved: boolean("isResolved").default(false).notNull(),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("errorCodes_diagnosticId_idx").on(table.diagnosticId),
    index("errorCodes_code_idx").on(table.code),
  ]
);

export type ErrorCode = typeof errorCodes.$inferSelect;
export type InsertErrorCode = typeof errorCodes.$inferInsert;

// OBD Parameters table - stores real-time parameter readings.
// This is the fastest growing table: see docs in README for the retention job.
export const obdParameters = mysqlTable(
  "obdParameters",
  {
    id: int("id").autoincrement().primaryKey(),
    diagnosticId: int("diagnosticId")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "cascade" }),
    parameterId: varchar("parameterId", { length: 10 }).notNull(),
    parameterName: varchar("parameterName", { length: 100 }).notNull(),
    value: decimal("value", {
      precision: 12,
      scale: 4,
      mode: "number",
    }).notNull(),
    unit: varchar("unit", { length: 50 }),
    minValue: decimal("minValue", { precision: 12, scale: 4, mode: "number" }),
    maxValue: decimal("maxValue", { precision: 12, scale: 4, mode: "number" }),
    isNormal: boolean("isNormal").default(true).notNull(),
    /** True when the reading came from the simulator rather than real hardware. */
    isSimulated: boolean("isSimulated").default(false).notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  table => [
    index("obdParameters_diagnosticId_idx").on(table.diagnosticId),
    index("obdParameters_timestamp_idx").on(table.timestamp),
    index("obdParameters_diagnosticId_parameterId_idx").on(
      table.diagnosticId,
      table.parameterId
    ),
  ]
);

export type ObdParameter = typeof obdParameters.$inferSelect;
export type InsertObdParameter = typeof obdParameters.$inferInsert;

// Diagnostic Reports table - stores generated reports
export const diagnosticReports = mysqlTable(
  "diagnosticReports",
  {
    id: int("id").autoincrement().primaryKey(),
    diagnosticId: int("diagnosticId")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "cascade" }),
    reportType: mysqlEnum("reportType", [
      "summary",
      "detailed",
      "pdf",
      "csv",
    ]).notNull(),
    reportData: text("reportData"),
    recommendations: text("recommendations"),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  },
  table => [index("diagnosticReports_diagnosticId_idx").on(table.diagnosticId)]
);

export type DiagnosticReport = typeof diagnosticReports.$inferSelect;
export type InsertDiagnosticReport = typeof diagnosticReports.$inferInsert;

export const usersRelations = relations(users, ({ many }) => ({
  vehicles: many(vehicles),
  obdDevices: many(obdDevices),
  diagnostics: many(diagnostics),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  user: one(users, { fields: [vehicles.userId], references: [users.id] }),
  diagnostics: many(diagnostics),
}));

export const obdDevicesRelations = relations(obdDevices, ({ one, many }) => ({
  user: one(users, { fields: [obdDevices.userId], references: [users.id] }),
  diagnostics: many(diagnostics),
}));

export const diagnosticsRelations = relations(diagnostics, ({ one, many }) => ({
  vehicle: one(vehicles, {
    fields: [diagnostics.vehicleId],
    references: [vehicles.id],
  }),
  user: one(users, { fields: [diagnostics.userId], references: [users.id] }),
  obdDevice: one(obdDevices, {
    fields: [diagnostics.obdDeviceId],
    references: [obdDevices.id],
  }),
  errorCodes: many(errorCodes),
  parameters: many(obdParameters),
  reports: many(diagnosticReports),
}));

export const errorCodesRelations = relations(errorCodes, ({ one }) => ({
  diagnostic: one(diagnostics, {
    fields: [errorCodes.diagnosticId],
    references: [diagnostics.id],
  }),
}));

export const obdParametersRelations = relations(obdParameters, ({ one }) => ({
  diagnostic: one(diagnostics, {
    fields: [obdParameters.diagnosticId],
    references: [diagnostics.id],
  }),
}));

export const diagnosticReportsRelations = relations(
  diagnosticReports,
  ({ one }) => ({
    diagnostic: one(diagnostics, {
      fields: [diagnosticReports.diagnosticId],
      references: [diagnostics.id],
    }),
  })
);
