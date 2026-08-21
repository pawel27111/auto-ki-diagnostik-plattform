import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Diagnostic, Vehicle } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import {
  DEFAULT_SCAN_PIDS,
  getPidDefinition,
  isNormalReading,
  PID_DEFINITIONS,
  roundReading,
  severityForCode,
} from "./obd/protocol";

/**
 * OBD Diagnostic Router
 * Handles vehicle management, OBD device connections, and diagnostic operations.
 *
 * Every procedure that names a vehicle or diagnostic by id resolves it through
 * {@link requireOwnedVehicle} / {@link requireOwnedDiagnostic} first. Those
 * scope the lookup to `ctx.user.id` in SQL, so an id belonging to another user
 * is indistinguishable from one that does not exist.
 */

async function requireOwnedVehicle(
  userId: number,
  vehicleId: number
): Promise<Vehicle> {
  const vehicle = await db.getOwnedVehicle(userId, vehicleId);
  if (!vehicle) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
  }
  return vehicle;
}

async function requireOwnedDiagnostic(
  userId: number,
  diagnosticId: number
): Promise<Diagnostic> {
  const diagnostic = await db.getOwnedDiagnostic(userId, diagnosticId);
  if (!diagnostic) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Diagnostic not found" });
  }
  return diagnostic;
}

/** A diagnostic must still be running before readings may be appended. */
function requireRunning(diagnostic: Diagnostic): void {
  if (diagnostic.status !== "running") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Diagnostic is already ${diagnostic.status}`,
    });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(17, "A VIN has exactly 17 characters")
  // I, O and Q are excluded from VINs to avoid confusion with 1 and 0.
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN contains invalid characters");

const severitySchema = z.enum(["info", "warning", "error", "critical"]);
const dtcSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[PCBU][0-3][0-9A-F]{3}$/,
    "Not a valid OBD-II diagnostic trouble code"
  );

export const obdRouter = router({
  // Vehicle Management
  vehicles: router({
    // Create a new vehicle
    create: protectedProcedure
      .input(
        z.object({
          vin: vinSchema,
          make: z.string().trim().min(1).max(50),
          model: z.string().trim().min(1).max(50),
          year: z
            .number()
            .int()
            .min(1900)
            .max(new Date().getFullYear() + 2),
          engineType: z.string().trim().max(50).optional(),
          fuelType: z.string().trim().max(50).optional(),
          licensePlate: z.string().trim().max(20).optional(),
          mileage: z.number().int().min(0).max(10_000_000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const vehicleId = await db.createVehicle({
            userId: ctx.user.id,
            ...input,
          });
          return { success: true, vehicleId };
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "You have already registered a vehicle with this VIN",
            });
          }
          throw error;
        }
      }),

    // Get all vehicles for the current user
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserVehicles(ctx.user.id);
    }),

    // Get a specific vehicle by ID
    getById: protectedProcedure
      .input(z.object({ vehicleId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return requireOwnedVehicle(ctx.user.id, input.vehicleId);
      }),
  }),

  // OBD Device Management
  devices: router({
    // Register a new OBD device
    create: protectedProcedure
      .input(
        z.object({
          deviceName: z.string().trim().min(1).max(100),
          deviceType: z.enum(["elm327", "canAdapter", "wifi", "bluetooth"]),
          connectionString: z.string().trim().max(255).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const deviceId = await db.createObdDevice({
          userId: ctx.user.id,
          ...input,
        });
        return { success: true, deviceId };
      }),

    // Get all OBD devices for the current user
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserObdDevices(ctx.user.id);
    }),

    /**
     * Serial ports this server will actually open.
     *
     * Reports the configured allow list, annotated with whether the port is
     * currently present, so the UI cannot offer a port that a live session
     * would then reject.
     */
    availablePorts: protectedProcedure.query(async () => {
      if (ENV.obdAllowedPorts.length === 0) return [];

      const { obdManager } = await import("./obd/obdManager");
      const present = new Map(
        (await obdManager.getAvailablePorts()).map(port => [port.path, port])
      );

      return ENV.obdAllowedPorts.map(path => ({
        path,
        manufacturer: present.get(path)?.manufacturer ?? null,
        isPresent: present.has(path),
      }));
    }),
  }),

  // Diagnostic Operations
  diagnostics: router({
    // Start a new diagnostic session
    start: protectedProcedure
      .input(
        z.object({
          vehicleId: z.number().int().positive(),
          obdDeviceId: z.number().int().positive().optional(),
          diagnosticType: z.enum([
            "full_scan",
            "quick_scan",
            "custom",
            "real_time",
          ]),
          mileage: z.number().int().min(0).max(10_000_000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedVehicle(ctx.user.id, input.vehicleId);

        // A device id from another user would silently link foreign hardware to
        // this session, so verify it the same way as the vehicle.
        if (input.obdDeviceId !== undefined) {
          const device = await db.getOwnedObdDevice(
            ctx.user.id,
            input.obdDeviceId
          );
          if (!device) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "OBD device not found",
            });
          }
        }

        const diagnosticId = await db.createDiagnostic({
          vehicleId: input.vehicleId,
          userId: ctx.user.id,
          obdDeviceId: input.obdDeviceId,
          diagnosticType: input.diagnosticType,
          mileageAtDiagnosis: input.mileage,
        });

        return {
          success: true,
          diagnosticId,
          status: "running" as const,
        };
      }),

    // Get diagnostic by ID
    getById: protectedProcedure
      .input(z.object({ diagnosticId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return requireOwnedDiagnostic(ctx.user.id, input.diagnosticId);
      }),

    // Get all diagnostics for a vehicle
    listByVehicle: protectedProcedure
      .input(z.object({ vehicleId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedVehicle(ctx.user.id, input.vehicleId);
        return db.getVehicleDiagnostics(input.vehicleId);
      }),

    // Recent diagnostics across all of the user's vehicles
    listRecent: protectedProcedure
      .input(
        z
          .object({ limit: z.number().int().min(1).max(100).default(20) })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return db.getUserDiagnostics(ctx.user.id, input?.limit ?? 20);
      }),

    // Add OBD parameter reading to diagnostic
    addParameter: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int().positive(),
          parameterId: z.string().trim().max(10),
          parameterName: z.string().trim().min(1).max(100),
          value: z.number().finite(),
          unit: z.string().trim().max(50).optional(),
          minValue: z.number().finite().optional(),
          maxValue: z.number().finite().optional(),
          isNormal: z.boolean().optional(),
          isSimulated: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const diagnostic = await requireOwnedDiagnostic(
          ctx.user.id,
          input.diagnosticId
        );
        requireRunning(diagnostic);

        const parameterId = await db.createObdParameter({
          diagnosticId: input.diagnosticId,
          parameterId: input.parameterId,
          parameterName: input.parameterName,
          value: roundReading(input.value),
          unit: input.unit,
          minValue: input.minValue,
          maxValue: input.maxValue,
          isNormal: input.isNormal ?? true,
          isSimulated: input.isSimulated ?? false,
        });
        return { success: true, parameterId };
      }),

    // Get all parameters for a diagnostic
    getParameters: protectedProcedure
      .input(z.object({ diagnosticId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedDiagnostic(ctx.user.id, input.diagnosticId);
        return db.getDiagnosticParameters(input.diagnosticId);
      }),

    // Add error code to diagnostic
    addErrorCode: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int().positive(),
          code: dtcSchema,
          description: z.string().trim().max(2000).optional(),
          severity: severitySchema.optional(),
          system: z.string().trim().max(50).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const diagnostic = await requireOwnedDiagnostic(
          ctx.user.id,
          input.diagnosticId
        );
        requireRunning(diagnostic);

        const errorCodeId = await db.createErrorCode({
          diagnosticId: input.diagnosticId,
          code: input.code,
          description: input.description,
          severity: input.severity ?? severityForCode(input.code),
          system: input.system,
        });
        return { success: true, errorCodeId };
      }),

    // Get all error codes for a diagnostic
    getErrorCodes: protectedProcedure
      .input(z.object({ diagnosticId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedDiagnostic(ctx.user.id, input.diagnosticId);
        return db.getDiagnosticErrorCodes(input.diagnosticId);
      }),

    // Complete a diagnostic session
    complete: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int().positive(),
          engineTemperature: z.number().finite().optional(),
          rpm: z.number().int().min(0).optional(),
          speed: z.number().int().min(0).optional(),
          fuelPressure: z.number().finite().min(0).optional(),
          oxygenSensor: z.number().finite().min(0).optional(),
          notes: z.string().trim().max(5000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const diagnostic = await requireOwnedDiagnostic(
          ctx.user.id,
          input.diagnosticId
        );
        requireRunning(diagnostic);

        // Counts are derived from what was actually stored rather than taken
        // from the client, so the summary can never contradict the detail rows.
        const storedCodes = await db.getDiagnosticErrorCodes(
          input.diagnosticId
        );
        const errorCount = storedCodes.filter(
          code => code.severity === "error" || code.severity === "critical"
        ).length;
        const warningCount = storedCodes.filter(
          code => code.severity === "warning"
        ).length;

        await db.updateDiagnosticStatus(input.diagnosticId, "completed", {
          errorCount,
          warningCount,
          engineTemperature: input.engineTemperature,
          rpm: input.rpm,
          speed: input.speed,
          fuelPressure: input.fuelPressure,
          oxygenSensor: input.oxygenSensor,
          notes: input.notes,
        });
        await db.updateVehicleDiagnosisTimestamp(diagnostic.vehicleId);

        return {
          success: true,
          status: "completed" as const,
          errorCount,
          warningCount,
        };
      }),

    // Fail a diagnostic session
    fail: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int().positive(),
          errorMessage: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const diagnostic = await requireOwnedDiagnostic(
          ctx.user.id,
          input.diagnosticId
        );
        requireRunning(diagnostic);

        await db.updateDiagnosticStatus(input.diagnosticId, "failed", {
          notes: input.errorMessage,
        });
        return { success: true, status: "failed" as const };
      }),

    // Cancel a running diagnostic session
    cancel: protectedProcedure
      .input(z.object({ diagnosticId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const diagnostic = await requireOwnedDiagnostic(
          ctx.user.id,
          input.diagnosticId
        );
        requireRunning(diagnostic);

        await db.updateDiagnosticStatus(input.diagnosticId, "cancelled");
        return { success: true, status: "cancelled" as const };
      }),
  }),

  // Catalogue of the PIDs this server knows how to decode, so the client does
  // not have to keep its own copy in sync.
  pids: router({
    list: protectedProcedure.query(() => {
      return Object.values(PID_DEFINITIONS).map(
        ({ pid, name, unit, normalRange, displayRange }) => ({
          pid,
          name,
          unit,
          normalRange: normalRange ?? null,
          displayRange,
        })
      );
    }),
  }),

  // Simulated OBD data, for use without real hardware. Everything written here
  // is flagged `isSimulated` so the UI can label it and it never passes for a
  // real measurement.
  mock: router({
    simulateDiagnostic: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int().positive(),
          /** Force the fault outcome instead of drawing one at random. */
          withFaults: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const diagnostic = await requireOwnedDiagnostic(
          ctx.user.id,
          input.diagnosticId
        );
        requireRunning(diagnostic);

        // Draw once. Deriving the stored counts from a second draw was how the
        // old implementation ended up reporting faults it had never written.
        const withFaults = input.withFaults ?? Math.random() < 0.3;

        const readings = DEFAULT_SCAN_PIDS.map(pid => {
          const definition = getPidDefinition(pid)!;
          const range = definition.normalRange ?? definition.displayRange;
          const span = range.max - range.min;
          // Sample inside the healthy band, with a small chance of an outlier
          // when this run is meant to show faults.
          const outlier = withFaults && Math.random() < 0.25;
          const value = outlier
            ? range.max + span * 0.1 * Math.random()
            : range.min + span * (0.25 + Math.random() * 0.5);

          const rounded = roundReading(value);
          return {
            diagnosticId: input.diagnosticId,
            parameterId: definition.pid,
            parameterName: definition.name,
            value: rounded,
            unit: definition.unit,
            minValue: definition.displayRange.min,
            maxValue: definition.displayRange.max,
            isNormal: isNormalReading(definition, rounded),
            isSimulated: true,
          };
        });

        await db.createObdParameters(readings);

        const simulatedFaults = withFaults
          ? [
              {
                code: "P0101",
                description:
                  "Mass or Volume Air Flow Circuit Range/Performance",
                system: "Powertrain",
              },
              {
                code: "P0300",
                description: "Random/Multiple Cylinder Misfire Detected",
                system: "Powertrain",
              },
            ]
          : [];

        for (const fault of simulatedFaults) {
          await db.createErrorCode({
            diagnosticId: input.diagnosticId,
            code: fault.code,
            description: fault.description,
            severity: severityForCode(fault.code),
            system: fault.system,
          });
        }

        const errorCount = simulatedFaults.filter(
          fault =>
            severityForCode(fault.code) === "error" ||
            severityForCode(fault.code) === "critical"
        ).length;
        const warningCount = simulatedFaults.filter(
          fault => severityForCode(fault.code) === "warning"
        ).length;

        const byPid = new Map(
          readings.map(reading => [reading.parameterId, reading.value])
        );
        await db.updateDiagnosticStatus(input.diagnosticId, "completed", {
          errorCount,
          warningCount,
          engineTemperature: byPid.get("05") ?? null,
          rpm:
            byPid.get("0C") !== undefined ? Math.round(byPid.get("0C")!) : null,
          speed:
            byPid.get("0D") !== undefined ? Math.round(byPid.get("0D")!) : null,
          fuelPressure: byPid.get("0A") ?? null,
          oxygenSensor: byPid.get("14") ?? null,
        });
        await db.updateVehicleDiagnosisTimestamp(diagnostic.vehicleId);

        return {
          success: true,
          status: "completed" as const,
          errorCount,
          warningCount,
          simulated: true,
        };
      }),
  }),
});
