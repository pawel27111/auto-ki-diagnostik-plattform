/**
 * Client-side diagnostic report export.
 *
 * Generated in the browser from data already loaded for the view, so no extra
 * round trip and no server-side rendering dependency.
 */

export interface ReportInput {
  vehicle: { make: string; model: string; year: number; vin: string; licensePlate?: string | null } | null;
  diagnostic: {
    id: number;
    status: string;
    startedAt: Date | string;
    completedAt?: Date | string | null;
    errorCount: number;
    warningCount: number;
  };
  parameters: {
    parameterId: string;
    parameterName: string;
    value: number;
    unit: string | null;
    isNormal: boolean;
    isSimulated: boolean;
  }[];
  errorCodes: { code: string; description: string | null; severity: string; system: string | null }[];
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote whenever the value could otherwise break the row structure.
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildReportCsv(input: ReportInput): string {
  const { vehicle, diagnostic, parameters, errorCodes } = input;
  const lines: string[] = [];

  lines.push("AutoKI Assistent — Diagnosebericht");
  lines.push("");
  lines.push(["Fahrzeug", vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.year})` : "—"].map(csvCell).join(";"));
  lines.push(["VIN", vehicle?.vin ?? "—"].map(csvCell).join(";"));
  lines.push(["Kennzeichen", vehicle?.licensePlate ?? "—"].map(csvCell).join(";"));
  lines.push(["Diagnose-ID", diagnostic.id].map(csvCell).join(";"));
  lines.push(["Status", diagnostic.status].map(csvCell).join(";"));
  lines.push(["Gestartet", new Date(diagnostic.startedAt).toISOString()].map(csvCell).join(";"));
  lines.push([
    "Abgeschlossen",
    diagnostic.completedAt ? new Date(diagnostic.completedAt).toISOString() : "—",
  ].map(csvCell).join(";"));
  lines.push(["Fehler", diagnostic.errorCount].map(csvCell).join(";"));
  lines.push(["Warnungen", diagnostic.warningCount].map(csvCell).join(";"));

  lines.push("");
  lines.push("OBD-Parameter");
  lines.push(["PID", "Bezeichnung", "Wert", "Einheit", "Im Normbereich", "Simuliert"].map(csvCell).join(";"));
  for (const parameter of parameters) {
    lines.push(
      [
        parameter.parameterId,
        parameter.parameterName,
        parameter.value,
        parameter.unit ?? "",
        parameter.isNormal ? "ja" : "nein",
        parameter.isSimulated ? "ja" : "nein",
      ]
        .map(csvCell)
        .join(";")
    );
  }

  lines.push("");
  lines.push("Fehlercodes");
  lines.push(["Code", "Beschreibung", "Schweregrad", "System"].map(csvCell).join(";"));
  if (errorCodes.length === 0) {
    lines.push(csvCell("Keine Fehlercodes gefunden"));
  } else {
    for (const code of errorCodes) {
      lines.push(
        [code.code, code.description ?? "", code.severity, code.system ?? ""].map(csvCell).join(";")
      );
    }
  }

  return lines.join("\r\n");
}

/**
 * Offer the report as a download.
 *
 * The BOM makes Excel read the file as UTF-8; without it German umlauts and
 * the degree sign come out mangled.
 */
export function downloadReportCsv(input: ReportInput): void {
  const csv = buildReportCsv(input);
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `diagnose-${input.diagnostic.id}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
