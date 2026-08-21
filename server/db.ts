import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  diagnostics,
  errorCodes,
  InsertUser,
  obdDevices,
  obdParameters,
  users,
  vehicles,
  type Diagnostic,
  type Vehicle,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Throws when no database is configured. Use in write paths that cannot degrade. */
async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/**
 * Drizzle's mysql2 driver returns `[ResultSetHeader, FieldPacket[]]` for
 * inserts. Callers need the generated primary key, so unwrap it here rather
 * than making every call site know the driver shape.
 */
function insertedId(result: { insertId: number }[] | readonly unknown[]): number {
  const header = (result as { insertId?: number }[])[0];
  const id = header?.insertId;
  if (typeof id !== "number" || id <= 0) {
    throw new Error("Insert did not return a generated id");
  }
  return id;
}

/**
 * `lastSignedIn` is refreshed on every authenticated request. Writing on each
 * one turns every read into a write, so only persist it when the stored value
 * is older than this.
 */
const LAST_SIGNED_IN_REFRESH_MS = 60 * 60 * 1000;

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/**
 * Refresh `lastSignedIn`, but at most once per {@link LAST_SIGNED_IN_REFRESH_MS}
 * per user. The WHERE clause makes this a no-op write rather than a read
 * followed by a conditional write, so concurrent requests cannot race.
 */
export async function touchLastSignedIn(userId: number, now = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const threshold = new Date(now.getTime() - LAST_SIGNED_IN_REFRESH_MS);
  try {
    await db
      .update(users)
      .set({ lastSignedIn: now })
      .where(and(eq(users.id, userId), sql`${users.lastSignedIn} < ${threshold}`));
  } catch (error) {
    // A failed timestamp refresh must never break an otherwise valid request.
    console.warn("[Database] Failed to refresh lastSignedIn:", error);
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Vehicle queries
export async function createVehicle(data: {
  userId: number;
  vin: string;
  make: string;
  model: string;
  year: number;
  engineType?: string | null;
  fuelType?: string | null;
  licensePlate?: string | null;
  mileage?: number | null;
}): Promise<number> {
  const db = await requireDb();
  const result = await db.insert(vehicles).values(data);
  return insertedId(result);
}

export async function getUserVehicles(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(vehicles).where(eq(vehicles.userId, userId)).orderBy(desc(vehicles.createdAt));
}

export async function getVehicleById(vehicleId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Fetch a vehicle only when it belongs to `userId`.
 *
 * The ownership filter is part of the query rather than a check on the result,
 * so a caller cannot forget to compare and cannot observe that an id exists
 * for somebody else.
 */
export async function getOwnedVehicle(userId: number, vehicleId: number): Promise<Vehicle | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateVehicleDiagnosisTimestamp(vehicleId: number, at = new Date()) {
  const db = await requireDb();
  return db.update(vehicles).set({ lastDiagnosisAt: at }).where(eq(vehicles.id, vehicleId));
}

// OBD Device queries
export async function createObdDevice(data: {
  userId: number;
  deviceName: string;
  deviceType: "elm327" | "canAdapter" | "wifi" | "bluetooth";
  connectionString?: string | null;
}): Promise<number> {
  const db = await requireDb();
  const result = await db.insert(obdDevices).values(data);
  return insertedId(result);
}

export async function getUserObdDevices(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(obdDevices).where(eq(obdDevices.userId, userId));
}

export async function getOwnedObdDevice(userId: number, deviceId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(obdDevices)
    .where(and(eq(obdDevices.id, deviceId), eq(obdDevices.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Diagnostic queries
export async function createDiagnostic(data: {
  vehicleId: number;
  userId: number;
  obdDeviceId?: number | null;
  diagnosticType: "full_scan" | "quick_scan" | "custom" | "real_time";
  mileageAtDiagnosis?: number | null;
}): Promise<number> {
  const db = await requireDb();
  const result = await db.insert(diagnostics).values(data);
  return insertedId(result);
}

export async function getDiagnosticById(diagnosticId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(diagnostics).where(eq(diagnostics.id, diagnosticId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Fetch a diagnostic only when it belongs to `userId`.
 *
 * Ownership is decided by `diagnostics.userId` rather than by walking to the
 * vehicle: a diagnostic can outlive a vehicle transfer, and the direct column
 * is the one that is indexed.
 */
export async function getOwnedDiagnostic(
  userId: number,
  diagnosticId: number
): Promise<Diagnostic | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(diagnostics)
    .where(and(eq(diagnostics.id, diagnosticId), eq(diagnostics.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getVehicleDiagnostics(vehicleId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(diagnostics)
    .where(eq(diagnostics.vehicleId, vehicleId))
    .orderBy(desc(diagnostics.startedAt));
}

export async function getUserDiagnostics(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(diagnostics)
    .where(eq(diagnostics.userId, userId))
    .orderBy(desc(diagnostics.startedAt))
    .limit(limit);
}

export type DiagnosticUpdate = Partial<{
  errorCount: number;
  warningCount: number;
  engineTemperature: number | null;
  rpm: number | null;
  speed: number | null;
  fuelPressure: number | null;
  oxygenSensor: number | null;
  notes: string | null;
  diagnosticData: string | null;
}>;

export async function updateDiagnosticStatus(
  diagnosticId: number,
  status: "running" | "completed" | "failed" | "cancelled",
  data?: DiagnosticUpdate
) {
  const db = await requireDb();

  const updateData: DiagnosticUpdate & {
    status: typeof status;
    completedAt?: Date;
  } = { status, ...data };

  if (status === "completed") {
    updateData.completedAt = new Date();
  }

  return db.update(diagnostics).set(updateData).where(eq(diagnostics.id, diagnosticId));
}

// Error Code queries
export async function createErrorCode(data: {
  diagnosticId: number;
  code: string;
  description?: string | null;
  severity: "info" | "warning" | "error" | "critical";
  system?: string | null;
}): Promise<number> {
  const db = await requireDb();
  const result = await db.insert(errorCodes).values(data);
  return insertedId(result);
}

export async function getDiagnosticErrorCodes(diagnosticId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(errorCodes).where(eq(errorCodes.diagnosticId, diagnosticId));
}

// OBD Parameter queries
export async function createObdParameter(data: {
  diagnosticId: number;
  parameterId: string;
  parameterName: string;
  value: number;
  unit?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  isNormal?: boolean;
  isSimulated?: boolean;
}): Promise<number> {
  const db = await requireDb();
  const result = await db.insert(obdParameters).values(data);
  return insertedId(result);
}

export async function createObdParameters(
  rows: {
    diagnosticId: number;
    parameterId: string;
    parameterName: string;
    value: number;
    unit?: string | null;
    minValue?: number | null;
    maxValue?: number | null;
    isNormal?: boolean;
    isSimulated?: boolean;
  }[]
): Promise<void> {
  if (rows.length === 0) return;
  const db = await requireDb();
  await db.insert(obdParameters).values(rows);
}

export async function getDiagnosticParameters(diagnosticId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(obdParameters)
    .where(eq(obdParameters.diagnosticId, diagnosticId))
    .orderBy(obdParameters.timestamp);
}

/**
 * Delete readings older than `olderThan` for the retention job. Parameters are
 * the fastest growing table by a wide margin.
 */
export async function pruneObdParameters(olderThan: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(obdParameters).where(sql`${obdParameters.timestamp} < ${olderThan}`);
}
