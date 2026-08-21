import { vi } from "vitest";
import type {
  Diagnostic,
  ErrorCode,
  ObdDevice,
  ObdParameter,
  User,
  Vehicle,
} from "../../drizzle/schema";

/**
 * In-memory stand-in for server/db.ts.
 *
 * Ownership is the thing under test, so the fake enforces it exactly the way
 * the real queries do — by filtering on userId — rather than trusting the
 * router to compare afterwards. A router that forgot the check would read a
 * foreign row here too, and the test would catch it.
 */
/** Row shape accepted by the real createObdParameter(s). */
interface ParameterRow {
  diagnosticId: number;
  parameterId: string;
  parameterName: string;
  value: number;
  unit?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  isNormal?: boolean;
  isSimulated?: boolean;
}

export function createFakeDb() {
  const state = {
    vehicles: [] as Vehicle[],
    devices: [] as ObdDevice[],
    diagnostics: [] as Diagnostic[],
    errorCodes: [] as ErrorCode[],
    parameters: [] as ObdParameter[],
    nextId: 1,
  };

  const id = () => state.nextId++;

  function addVehicle(
    userId: number,
    overrides: Partial<Vehicle> = {}
  ): Vehicle {
    const vehicle = {
      id: id(),
      userId,
      vin: `VIN${String(state.nextId).padStart(14, "0")}`,
      make: "BMW",
      model: "320i",
      year: 2020,
      engineType: null,
      fuelType: null,
      licensePlate: null,
      mileage: null,
      status: "active",
      lastDiagnosisAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Vehicle;
    state.vehicles.push(vehicle);
    return vehicle;
  }

  function addDiagnostic(
    userId: number,
    vehicleId: number,
    overrides: Partial<Diagnostic> = {}
  ): Diagnostic {
    const diagnostic = {
      id: id(),
      vehicleId,
      userId,
      obdDeviceId: null,
      diagnosticType: "full_scan",
      status: "running",
      errorCount: 0,
      warningCount: 0,
      mileageAtDiagnosis: null,
      engineTemperature: null,
      rpm: null,
      speed: null,
      fuelPressure: null,
      oxygenSensor: null,
      diagnosticData: null,
      notes: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Diagnostic;
    state.diagnostics.push(diagnostic);
    return diagnostic;
  }

  const db = {
    getOwnedVehicle: vi.fn(async (userId: number, vehicleId: number) =>
      state.vehicles.find(v => v.id === vehicleId && v.userId === userId)
    ),
    getVehicleById: vi.fn(async (vehicleId: number) =>
      state.vehicles.find(v => v.id === vehicleId)
    ),
    getUserVehicles: vi.fn(async (userId: number) =>
      state.vehicles.filter(v => v.userId === userId)
    ),
    createVehicle: vi.fn(
      async (data: { userId: number; vin: string }) =>
        addVehicle(data.userId, data as never).id
    ),
    updateVehicleDiagnosisTimestamp: vi.fn(
      async (vehicleId: number, at = new Date()) => {
        const vehicle = state.vehicles.find(v => v.id === vehicleId);
        if (vehicle) vehicle.lastDiagnosisAt = at;
      }
    ),

    getOwnedObdDevice: vi.fn(async (userId: number, deviceId: number) =>
      state.devices.find(d => d.id === deviceId && d.userId === userId)
    ),
    getUserObdDevices: vi.fn(async (userId: number) =>
      state.devices.filter(d => d.userId === userId)
    ),
    createObdDevice: vi.fn(async (data: { userId: number }) => {
      const device = { id: id(), ...data } as ObdDevice;
      state.devices.push(device);
      return device.id;
    }),

    getOwnedDiagnostic: vi.fn(async (userId: number, diagnosticId: number) =>
      state.diagnostics.find(d => d.id === diagnosticId && d.userId === userId)
    ),
    getDiagnosticById: vi.fn(async (diagnosticId: number) =>
      state.diagnostics.find(d => d.id === diagnosticId)
    ),
    getVehicleDiagnostics: vi.fn(async (vehicleId: number) =>
      state.diagnostics.filter(d => d.vehicleId === vehicleId)
    ),
    getUserDiagnostics: vi.fn(async (userId: number) =>
      state.diagnostics.filter(d => d.userId === userId)
    ),
    createDiagnostic: vi.fn(
      async (data: { userId: number; vehicleId: number }) =>
        addDiagnostic(data.userId, data.vehicleId, data as never).id
    ),
    updateDiagnosticStatus: vi.fn(
      async (diagnosticId: number, status: string, data?: object) => {
        const diagnostic = state.diagnostics.find(d => d.id === diagnosticId);
        if (diagnostic) Object.assign(diagnostic, { status }, data ?? {});
      }
    ),

    createErrorCode: vi.fn(
      async (data: {
        diagnosticId: number;
        code: string;
        severity: string;
      }) => {
        const errorCode = { id: id(), ...data } as ErrorCode;
        state.errorCodes.push(errorCode);
        return errorCode.id;
      }
    ),
    getDiagnosticErrorCodes: vi.fn(async (diagnosticId: number) =>
      state.errorCodes.filter(e => e.diagnosticId === diagnosticId)
    ),

    createObdParameter: vi.fn(async (data: ParameterRow) => {
      const parameter = { id: id(), ...data } as ObdParameter;
      state.parameters.push(parameter);
      return parameter.id;
    }),
    createObdParameters: vi.fn(async (rows: ParameterRow[]) => {
      for (const row of rows)
        state.parameters.push({ id: id(), ...row } as ObdParameter);
    }),
    getDiagnosticParameters: vi.fn(async (diagnosticId: number) =>
      state.parameters.filter(p => p.diagnosticId === diagnosticId)
    ),

    upsertUser: vi.fn(async () => undefined),
    touchLastSignedIn: vi.fn(async () => undefined),
    getUserByOpenId: vi.fn(async () => undefined),
    pruneObdParameters: vi.fn(async () => undefined),
    getDb: vi.fn(async () => null),
  };

  return { db, state, addVehicle, addDiagnostic };
}

export function makeUser(id: number, overrides: Partial<User> = {}): User {
  return {
    id,
    openId: `open-${id}`,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}
