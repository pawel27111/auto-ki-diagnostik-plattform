import { describe, expect, it } from "vitest";
import { buildReportCsv } from "../../client/src/lib/report";

const base = {
  vehicle: {
    make: "BMW",
    model: "320i",
    year: 2020,
    vin: "WBA12345678901234",
    licensePlate: null,
  },
  diagnostic: {
    id: 7,
    status: "completed",
    startedAt: new Date("2026-01-15T10:00:00Z"),
    completedAt: new Date("2026-01-15T10:05:00Z"),
    errorCount: 1,
    warningCount: 0,
  },
  parameters: [
    {
      parameterId: "0C",
      parameterName: "Engine RPM",
      value: 1250,
      unit: "rpm",
      isNormal: true,
      isSimulated: false,
    },
  ],
  errorCodes: [
    {
      code: "P0300",
      description: "Misfire",
      severity: "critical",
      system: "Powertrain",
    },
  ],
};

describe("buildReportCsv", () => {
  it("includes vehicle, parameters and codes", () => {
    const csv = buildReportCsv(base);
    expect(csv).toContain("WBA12345678901234");
    expect(csv).toContain("Engine RPM");
    expect(csv).toContain("P0300");
  });

  it("quotes values that would otherwise break the row structure", () => {
    const csv = buildReportCsv({
      ...base,
      errorCodes: [
        {
          code: "P0300",
          // A semicolon is the field separator and a quote is the escape char.
          description: 'Misfire; cylinder "3"',
          severity: "critical",
          system: null,
        },
      ],
    });
    expect(csv).toContain('"Misfire; cylinder ""3"""');
  });

  it("marks simulated readings", () => {
    const csv = buildReportCsv({
      ...base,
      parameters: [{ ...base.parameters[0], isSimulated: true }],
    });
    const row = csv.split("\r\n").find(line => line.startsWith("0C"));
    expect(row?.endsWith(";ja")).toBe(true);
  });

  it("states plainly when there are no codes", () => {
    const csv = buildReportCsv({ ...base, errorCodes: [] });
    expect(csv).toContain("Keine Fehlercodes gefunden");
  });
});
