/**
 * Shared formatting for diagnostic values.
 *
 * Readings arrive as numbers with a separate unit, so units live here rather
 * than being baked into stored strings the way the old schema did.
 */

const numberFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return numberFormat.format(value);
}

export function formatMeasurement(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return unit ? `${numberFormat.format(value)} ${unit}` : numberFormat.format(value);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormat.format(date);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "Noch keine Diagnose";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "Heute";
  if (days === 1) return "Gestern";
  if (days < 7) return `Vor ${days} Tagen`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "Vor 1 Woche" : `Vor ${weeks} Wochen`;
  }
  return formatDate(date);
}

/**
 * Position of `value` within [min, max] as a percentage.
 *
 * Clamped and NaN-guarded because it feeds a CSS width: an unclamped result
 * from a missing range produced `width: NaN%`, which browsers drop, leaving
 * the bar stuck at full width.
 */
export function toPercent(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined
): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;

  const lower = Number.isFinite(min ?? NaN) ? (min as number) : 0;
  const upper = Number.isFinite(max ?? NaN) ? (max as number) : 100;
  const span = upper - lower;
  if (span <= 0) return 0;

  return Math.min(100, Math.max(0, ((value - lower) / span) * 100));
}

export const SEVERITY_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Warnung",
  error: "Fehler",
  critical: "Kritisch",
};

export const SEVERITY_CLASSES: Record<string, string> = {
  info: "bg-blue-600/20 text-blue-300 border-blue-500/30",
  warning: "bg-yellow-600/20 text-yellow-300 border-yellow-500/30",
  error: "bg-orange-600/20 text-orange-300 border-orange-500/30",
  critical: "bg-red-600/20 text-red-300 border-red-500/30",
};

export const DIAGNOSTIC_STATUS_LABELS: Record<string, string> = {
  running: "Läuft",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  active: "Gut",
  inactive: "Inaktiv",
  warning: "Warnung",
  error: "Fehler",
};

export const DIAGNOSTIC_TYPE_LABELS: Record<string, string> = {
  full_scan: "Vollständiger Scan",
  quick_scan: "Schnellscan",
  custom: "Benutzerdefiniert",
  real_time: "Echtzeit",
};
