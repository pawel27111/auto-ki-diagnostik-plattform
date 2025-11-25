import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

/**
 * OBD Diagnostic Router
 * Handles vehicle management, OBD device connections, and diagnostic operations
 */
export const obdRouter = router({
  // Vehicle Management
  vehicles: router({
    // Create a new vehicle
    create: protectedProcedure
      .input(
        z.object({
          vin: z.string().min(1),
          make: z.string().min(1),
          model: z.string().min(1),
          year: z.number().int().min(1900).max(2100),
          engineType: z.string().optional(),
          fuelType: z.string().optional(),
          licensePlate: z.string().optional(),
          mileage: z.number().int().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          await db.createVehicle({
            userId: ctx.user.id,
            ...input,
          });
          return { success: true, vehicleId: 1 };
        } catch (error: any) {
          if (error.message.includes("Duplicate entry")) {
            throw new Error("Vehicle with this VIN already exists");
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
      .input(z.object({ vehicleId: z.number().int() }))
      .query(async ({ input }) => {
        return db.getVehicleById(input.vehicleId);
      }),
  }),

  // OBD Device Management
  devices: router({
    // Register a new OBD device
    create: protectedProcedure
      .input(
        z.object({
          deviceName: z.string().min(1),
          deviceType: z.enum(["elm327", "canAdapter", "wifi", "bluetooth"]),
          connectionString: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.createObdDevice({
          userId: ctx.user.id,
          ...input,
        });
        return { success: true, deviceId: 1 };
      }),

    // Get all OBD devices for the current user
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserObdDevices(ctx.user.id);
    }),
  }),

  // Diagnostic Operations
  diagnostics: router({
    // Start a new diagnostic session
    start: protectedProcedure
      .input(
        z.object({
          vehicleId: z.number().int(),
          obdDeviceId: z.number().int().optional(),
          diagnosticType: z.enum(["full_scan", "quick_scan", "custom", "real_time"]),
          mileage: z.number().int().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify vehicle belongs to user
        const vehicle = await db.getVehicleById(input.vehicleId);
        if (!vehicle || vehicle.userId !== ctx.user.id) {
          throw new Error("Vehicle not found or access denied");
        }

        // Create diagnostic record
        await db.createDiagnostic({
          vehicleId: input.vehicleId,
          userId: ctx.user.id,
          obdDeviceId: input.obdDeviceId,
          diagnosticType: input.diagnosticType,
          mileageAtDiagnosis: input.mileage,
        });

        return {
          success: true,
          diagnosticId: 1,
          status: "running",
        };
      }),

    // Get diagnostic by ID
    getById: protectedProcedure
      .input(z.object({ diagnosticId: z.number().int() }))
      .query(async ({ input }) => {
        const diagnostic = await db.getDiagnosticById(input.diagnosticId);
        if (!diagnostic) {
          throw new Error("Diagnostic not found");
        }
        return diagnostic;
      }),

    // Get all diagnostics for a vehicle
    listByVehicle: protectedProcedure
      .input(z.object({ vehicleId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        // Verify vehicle belongs to user
        const vehicle = await db.getVehicleById(input.vehicleId);
        if (!vehicle || vehicle.userId !== ctx.user.id) {
          throw new Error("Vehicle not found or access denied");
        }

        return db.getVehicleDiagnostics(input.vehicleId);
      }),

    // Add OBD parameter reading to diagnostic
    addParameter: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int(),
          parameterId: z.string(),
          parameterName: z.string(),
          value: z.string(),
          unit: z.string().optional(),
          minValue: z.string().optional(),
          maxValue: z.string().optional(),
          isNormal: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await db.createObdParameter({
          diagnosticId: input.diagnosticId,
          parameterId: input.parameterId,
          parameterName: input.parameterName,
          value: input.value,
          unit: input.unit,
          minValue: input.minValue,
          maxValue: input.maxValue,
          isNormal: input.isNormal ? 1 : 0,
        });
        return { success: true, parameterId: 1 };
      }),

    // Get all parameters for a diagnostic
    getParameters: protectedProcedure
      .input(z.object({ diagnosticId: z.number().int() }))
      .query(async ({ input }) => {
        return db.getDiagnosticParameters(input.diagnosticId);
      }),

    // Add error code to diagnostic
    addErrorCode: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int(),
          code: z.string(),
          description: z.string().optional(),
          severity: z.enum(["info", "warning", "error", "critical"]),
          system: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await db.createErrorCode({
          diagnosticId: input.diagnosticId,
          code: input.code,
          description: input.description,
          severity: input.severity,
          system: input.system,
        });
        return { success: true, errorCodeId: 1 };
      }),

    // Get all error codes for a diagnostic
    getErrorCodes: protectedProcedure
      .input(z.object({ diagnosticId: z.number().int() }))
      .query(async ({ input }) => {
        return db.getDiagnosticErrorCodes(input.diagnosticId);
      }),

    // Complete a diagnostic session
    complete: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int(),
          errorCount: z.number().int().optional(),
          warningCount: z.number().int().optional(),
          engineTemperature: z.string().optional(),
          rpm: z.string().optional(),
          speed: z.string().optional(),
          fuelPressure: z.string().optional(),
          oxygenSensor: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const updateData = {
          status: "completed" as const,
          errorCount: input.errorCount ?? 0,
          warningCount: input.warningCount ?? 0,
          engineTemperature: input.engineTemperature,
          rpm: input.rpm,
          speed: input.speed,
          fuelPressure: input.fuelPressure,
          oxygenSensor: input.oxygenSensor,
          notes: input.notes,
        };

        await db.updateDiagnosticStatus(input.diagnosticId, "completed", updateData);
        return { success: true, status: "completed" };
      }),

    // Fail a diagnostic session
    fail: protectedProcedure
      .input(
        z.object({
          diagnosticId: z.number().int(),
          errorMessage: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateDiagnosticStatus(input.diagnosticId, "failed", {
          notes: input.errorMessage,
        });
        return { success: true, status: "failed" };
      }),
  }),

  // Mock OBD Data Simulation (for testing without real hardware)
  mock: router({
    // Simulate a complete diagnostic scan with realistic data
    simulateDiagnostic: protectedProcedure
      .input(z.object({ diagnosticId: z.number().int() }))
      .mutation(async ({ input }) => {
        // Simulate engine parameters
        const parameters = [
          {
            parameterId: "010C",
            parameterName: "Engine RPM",
            value: "1250",
            unit: "rpm",
            minValue: "0",
            maxValue: "8000",
            isNormal: true,
          },
          {
            parameterId: "010D",
            parameterName: "Vehicle Speed",
            value: "45",
            unit: "km/h",
            minValue: "0",
            maxValue: "300",
            isNormal: true,
          },
          {
            parameterId: "0105",
            parameterName: "Engine Coolant Temperature",
            value: "92",
            unit: "°C",
            minValue: "-40",
            maxValue: "215",
            isNormal: true,
          },
          {
            parameterId: "010A",
            parameterName: "Fuel Pressure",
            value: "55",
            unit: "psi",
            minValue: "30",
            maxValue: "70",
            isNormal: true,
          },
          {
            parameterId: "0114",
            parameterName: "O2 Sensor (Bank 1, Sensor 1)",
            value: "0.45",
            unit: "V",
            minValue: "0",
            maxValue: "1",
            isNormal: true,
          },
        ];

        // Add parameters to diagnostic
        for (const param of parameters) {
          await db.createObdParameter({
            diagnosticId: input.diagnosticId,
            parameterId: param.parameterId,
            parameterName: param.parameterName,
            value: param.value,
            unit: param.unit,
            minValue: param.minValue,
            maxValue: param.maxValue,
            isNormal: param.isNormal ? 1 : 0,
          });
        }

        // Simulate some error codes (optional - 30% chance)
        if (Math.random() < 0.3) {
          const errorCodes = [
            {
              code: "P0101",
              description: "Mass or Volume Air Flow Circuit Range/Performance",
              severity: "warning" as const,
              system: "Engine",
            },
            {
              code: "P0300",
              description: "Random/Multiple Cylinder Misfire Detected",
              severity: "error" as const,
              system: "Engine",
            },
          ];

          for (const errorCode of errorCodes) {
            await db.createErrorCode({
              diagnosticId: input.diagnosticId,
              code: errorCode.code,
              description: errorCode.description,
              severity: errorCode.severity,
              system: errorCode.system,
            });
          }
        }

        // Complete the diagnostic
        await db.updateDiagnosticStatus(input.diagnosticId, "completed", {
          errorCount: Math.random() < 0.3 ? 2 : 0,
          warningCount: Math.random() < 0.5 ? 1 : 0,
          engineTemperature: "92°C",
          rpm: "1250 rpm",
          speed: "45 km/h",
          fuelPressure: "55 psi",
          oxygenSensor: "0.45 V",
        });

        return { success: true, status: "completed" };
      }),
  }),
});
