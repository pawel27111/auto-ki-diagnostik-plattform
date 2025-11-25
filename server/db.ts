import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

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
      values.role = 'admin';
      updateSet.role = 'admin';
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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { vehicles } = await import("../drizzle/schema");
  const result = await db.insert(vehicles).values(data);
  return result;
}

export async function getUserVehicles(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { vehicles } = await import("../drizzle/schema");
  return db.select().from(vehicles).where(eq(vehicles.userId, userId));
}

export async function getVehicleById(vehicleId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const { vehicles } = await import("../drizzle/schema");
  const result = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// OBD Device queries
export async function createObdDevice(data: {
  userId: number;
  deviceName: string;
  deviceType: "elm327" | "canAdapter" | "wifi" | "bluetooth";
  connectionString?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { obdDevices } = await import("../drizzle/schema");
  return db.insert(obdDevices).values(data);
}

export async function getUserObdDevices(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { obdDevices } = await import("../drizzle/schema");
  return db.select().from(obdDevices).where(eq(obdDevices.userId, userId));
}

// Diagnostic queries
export async function createDiagnostic(data: {
  vehicleId: number;
  userId: number;
  obdDeviceId?: number | null;
  diagnosticType: "full_scan" | "quick_scan" | "custom" | "real_time";
  mileageAtDiagnosis?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { diagnostics } = await import("../drizzle/schema");
  return db.insert(diagnostics).values(data);
}

export async function getDiagnosticById(diagnosticId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const { diagnostics } = await import("../drizzle/schema");
  const result = await db.select().from(diagnostics).where(eq(diagnostics.id, diagnosticId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getVehicleDiagnostics(vehicleId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { diagnostics } = await import("../drizzle/schema");
  return db.select().from(diagnostics).where(eq(diagnostics.vehicleId, vehicleId));
}

export async function updateDiagnosticStatus(diagnosticId: number, status: "running" | "completed" | "failed" | "cancelled", data?: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { diagnostics } = await import("../drizzle/schema");
  const updateData: any = { status };
  
  if (status === "completed") {
    updateData.completedAt = new Date();
  }
  
  if (data) {
    Object.assign(updateData, data);
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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { errorCodes } = await import("../drizzle/schema");
  return db.insert(errorCodes).values(data);
}

export async function getDiagnosticErrorCodes(diagnosticId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { errorCodes } = await import("../drizzle/schema");
  return db.select().from(errorCodes).where(eq(errorCodes.diagnosticId, diagnosticId));
}

// OBD Parameter queries
export async function createObdParameter(data: {
  diagnosticId: number;
  parameterId: string;
  parameterName: string;
  value: string;
  unit?: string | null;
  minValue?: string | null;
  maxValue?: string | null;
  isNormal?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { obdParameters } = await import("../drizzle/schema");
  return db.insert(obdParameters).values(data);
}

export async function getDiagnosticParameters(diagnosticId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { obdParameters } = await import("../drizzle/schema");
  return db.select().from(obdParameters).where(eq(obdParameters.diagnosticId, diagnosticId));
}
