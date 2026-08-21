import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { createFakeDb, makeUser } from "./fakeDb";

const fake = createFakeDb();

// The router imports the db module by namespace, so the mock has to stand in
// for the whole module.
vi.mock("../db", () => fake.db);

const { obdRouter } = await import("../obdRouter");

const OWNER = makeUser(1);
const ATTACKER = makeUser(2);

function callerFor(user: typeof OWNER) {
  const ctx = {
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as unknown as TrpcContext;
  return obdRouter.createCaller(ctx);
}

/** Assert the call fails as NOT_FOUND — never as a 500 that leaks internals. */
async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toThrow(TRPCError);
  await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" });
}

describe("obdRouter ownership", () => {
  let vehicleId: number;
  let diagnosticId: number;

  beforeEach(() => {
    fake.state.vehicles.length = 0;
    fake.state.diagnostics.length = 0;
    fake.state.errorCodes.length = 0;
    fake.state.parameters.length = 0;
    vi.clearAllMocks();

    vehicleId = fake.addVehicle(OWNER.id).id;
    diagnosticId = fake.addDiagnostic(OWNER.id, vehicleId).id;
  });

  describe("read paths", () => {
    it("lets the owner read their own vehicle", async () => {
      const vehicle = await callerFor(OWNER).vehicles.getById({ vehicleId });
      expect(vehicle.id).toBe(vehicleId);
    });

    it("hides another user's vehicle", async () => {
      await expectNotFound(callerFor(ATTACKER).vehicles.getById({ vehicleId }));
    });

    it("hides another user's diagnostic", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.getById({ diagnosticId })
      );
    });

    it("hides another user's diagnostic parameters", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.getParameters({ diagnosticId })
      );
    });

    it("hides another user's diagnostic error codes", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.getErrorCodes({ diagnosticId })
      );
    });

    it("hides diagnostics of another user's vehicle", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.listByVehicle({ vehicleId })
      );
    });

    it("scopes list queries to the calling user", async () => {
      fake.addVehicle(ATTACKER.id);
      const owned = await callerFor(OWNER).vehicles.list();
      expect(owned).toHaveLength(1);
      expect(owned[0].userId).toBe(OWNER.id);
    });
  });

  describe("write paths", () => {
    it("refuses to append a parameter to another user's diagnostic", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.addParameter({
          diagnosticId,
          parameterId: "0C",
          parameterName: "Engine RPM",
          value: 1200,
        })
      );
      // The check must happen before the insert, not after.
      expect(fake.db.createObdParameter).not.toHaveBeenCalled();
      expect(fake.state.parameters).toHaveLength(0);
    });

    it("refuses to append an error code to another user's diagnostic", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.addErrorCode({
          diagnosticId,
          code: "P0300",
        })
      );
      expect(fake.db.createErrorCode).not.toHaveBeenCalled();
    });

    it("refuses to complete another user's diagnostic", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.complete({ diagnosticId })
      );
      expect(fake.db.updateDiagnosticStatus).not.toHaveBeenCalled();
    });

    it("refuses to fail another user's diagnostic", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.fail({ diagnosticId })
      );
      expect(fake.db.updateDiagnosticStatus).not.toHaveBeenCalled();
    });

    it("refuses to cancel another user's diagnostic", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.cancel({ diagnosticId })
      );
      expect(fake.db.updateDiagnosticStatus).not.toHaveBeenCalled();
    });

    it("refuses to run the simulator against another user's diagnostic", async () => {
      await expectNotFound(
        callerFor(ATTACKER).mock.simulateDiagnostic({ diagnosticId })
      );
      expect(fake.db.createObdParameters).not.toHaveBeenCalled();
      expect(fake.db.updateDiagnosticStatus).not.toHaveBeenCalled();
    });

    it("refuses to start a diagnostic on another user's vehicle", async () => {
      await expectNotFound(
        callerFor(ATTACKER).diagnostics.start({
          vehicleId,
          diagnosticType: "quick_scan",
        })
      );
      expect(fake.db.createDiagnostic).not.toHaveBeenCalled();
    });

    it("refuses to attach another user's OBD device to an own diagnostic", async () => {
      const attackerVehicle = fake.addVehicle(ATTACKER.id);
      const ownerDeviceId = await fake.db.createObdDevice({ userId: OWNER.id });

      await expectNotFound(
        callerFor(ATTACKER).diagnostics.start({
          vehicleId: attackerVehicle.id,
          obdDeviceId: ownerDeviceId,
          diagnosticType: "quick_scan",
        })
      );
    });
  });
});

describe("obdRouter behaviour", () => {
  let vehicleId: number;

  beforeEach(() => {
    fake.state.vehicles.length = 0;
    fake.state.diagnostics.length = 0;
    fake.state.errorCodes.length = 0;
    fake.state.parameters.length = 0;
    vi.clearAllMocks();
    vehicleId = fake.addVehicle(OWNER.id).id;
  });

  it("returns the generated id rather than a constant", async () => {
    const caller = callerFor(OWNER);
    const first = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });
    const second = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });

    expect(first.diagnosticId).toBeGreaterThan(0);
    expect(second.diagnosticId).not.toBe(first.diagnosticId);
  });

  it("derives completion counts from the stored codes", async () => {
    const caller = callerFor(OWNER);
    const { diagnosticId } = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });

    await caller.diagnostics.addErrorCode({ diagnosticId, code: "P0300" }); // critical
    await caller.diagnostics.addErrorCode({ diagnosticId, code: "P0101" }); // warning

    const result = await caller.diagnostics.complete({ diagnosticId });
    expect(result).toMatchObject({ errorCount: 1, warningCount: 1 });
  });

  it("assigns severity from the code when the client omits it", async () => {
    const caller = callerFor(OWNER);
    const { diagnosticId } = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });
    await caller.diagnostics.addErrorCode({ diagnosticId, code: "P0300" });

    expect(fake.db.createErrorCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: "P0300", severity: "critical" })
    );
  });

  it("rejects malformed trouble codes", async () => {
    const caller = callerFor(OWNER);
    const { diagnosticId } = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });
    await expect(
      caller.diagnostics.addErrorCode({ diagnosticId, code: "NOTACODE" })
    ).rejects.toThrow();
  });

  it("rejects an invalid VIN before touching the database", async () => {
    await expect(
      callerFor(OWNER).vehicles.create({
        vin: "TOOSHORT",
        make: "BMW",
        model: "320i",
        year: 2020,
      })
    ).rejects.toThrow();
    expect(fake.db.createVehicle).not.toHaveBeenCalled();
  });

  it("rejects a VIN containing the disallowed letters I, O or Q", async () => {
    await expect(
      callerFor(OWNER).vehicles.create({
        vin: "WBAIOQ12345678901",
        make: "BMW",
        model: "320i",
        year: 2020,
      })
    ).rejects.toThrow();
  });

  it("refuses to append readings to a diagnostic that already finished", async () => {
    const caller = callerFor(OWNER);
    const { diagnosticId } = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });
    await caller.diagnostics.complete({ diagnosticId });

    await expect(
      caller.diagnostics.addParameter({
        diagnosticId,
        parameterId: "0C",
        parameterName: "Engine RPM",
        value: 1200,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps the simulator's stored counts consistent with the codes it wrote", async () => {
    const caller = callerFor(OWNER);
    const { diagnosticId } = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });

    const result = await caller.mock.simulateDiagnostic({
      diagnosticId,
      withFaults: true,
    });
    const storedCodes = fake.state.errorCodes.filter(
      code => code.diagnosticId === diagnosticId
    );

    const critical = storedCodes.filter(
      c => c.severity === "error" || c.severity === "critical"
    );
    const warnings = storedCodes.filter(c => c.severity === "warning");
    expect(result.errorCount).toBe(critical.length);
    expect(result.warningCount).toBe(warnings.length);
  });

  it("writes no codes when the simulator runs without faults", async () => {
    const caller = callerFor(OWNER);
    const { diagnosticId } = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });

    const result = await caller.mock.simulateDiagnostic({
      diagnosticId,
      withFaults: false,
    });
    expect(result).toMatchObject({ errorCount: 0, warningCount: 0 });
    expect(fake.state.errorCodes).toHaveLength(0);
  });

  it("marks every simulated reading as simulated", async () => {
    const caller = callerFor(OWNER);
    const { diagnosticId } = await caller.diagnostics.start({
      vehicleId,
      diagnosticType: "full_scan",
    });
    await caller.mock.simulateDiagnostic({ diagnosticId, withFaults: false });

    const rows = fake.db.createObdParameters.mock.calls[0][0];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.isSimulated)).toBe(true);
  });
});
