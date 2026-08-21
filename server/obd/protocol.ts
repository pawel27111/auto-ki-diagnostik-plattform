/**
 * OBD-II protocol decoding.
 *
 * Pure functions only — no I/O, no device state. The serial transport lives in
 * obdManager.ts; keeping the wire format separate makes it testable without
 * hardware and lets the simulator produce values in exactly the same shape as
 * a real adapter.
 *
 * Formulas follow SAE J1979 / the OBD-II PID tables.
 */

export type Severity = "info" | "warning" | "error" | "critical";

export interface PidDefinition {
  /** Mode 01 PID, two uppercase hex digits (e.g. "0C"). */
  pid: string;
  name: string;
  unit: string;
  /** Number of data bytes the ECU returns for this PID. */
  bytes: number;
  /** Converts the raw data bytes into a physical value. */
  decode: (bytes: number[]) => number;
  /** Inclusive range considered healthy; used to flag readings. */
  normalRange?: { min: number; max: number };
  /** Full scale for UI gauges. */
  displayRange: { min: number; max: number };
}

/**
 * Supported Mode 01 PIDs. Keyed by the bare PID without the "01" mode prefix,
 * because that is what both the ELM327 request and the response echo use.
 */
export const PID_DEFINITIONS: Record<string, PidDefinition> = {
  "04": {
    pid: "04",
    name: "Calculated Engine Load",
    unit: "%",
    bytes: 1,
    decode: ([a]) => (a * 100) / 255,
    normalRange: { min: 0, max: 90 },
    displayRange: { min: 0, max: 100 },
  },
  "05": {
    pid: "05",
    name: "Engine Coolant Temperature",
    unit: "°C",
    bytes: 1,
    decode: ([a]) => a - 40,
    normalRange: { min: 70, max: 105 },
    displayRange: { min: -40, max: 215 },
  },
  "0A": {
    pid: "0A",
    name: "Fuel Pressure",
    unit: "kPa",
    bytes: 1,
    decode: ([a]) => a * 3,
    normalRange: { min: 200, max: 500 },
    displayRange: { min: 0, max: 765 },
  },
  "0B": {
    pid: "0B",
    name: "Intake Manifold Absolute Pressure",
    unit: "kPa",
    bytes: 1,
    decode: ([a]) => a,
    normalRange: { min: 20, max: 105 },
    displayRange: { min: 0, max: 255 },
  },
  "0C": {
    pid: "0C",
    name: "Engine RPM",
    unit: "rpm",
    bytes: 2,
    decode: ([a, b]) => (a * 256 + b) / 4,
    normalRange: { min: 600, max: 4000 },
    displayRange: { min: 0, max: 16383 },
  },
  "0D": {
    pid: "0D",
    name: "Vehicle Speed",
    unit: "km/h",
    bytes: 1,
    decode: ([a]) => a,
    normalRange: { min: 0, max: 200 },
    displayRange: { min: 0, max: 255 },
  },
  "0E": {
    pid: "0E",
    name: "Timing Advance",
    unit: "°",
    bytes: 1,
    decode: ([a]) => a / 2 - 64,
    normalRange: { min: -10, max: 40 },
    displayRange: { min: -64, max: 63.5 },
  },
  "0F": {
    pid: "0F",
    name: "Intake Air Temperature",
    unit: "°C",
    bytes: 1,
    decode: ([a]) => a - 40,
    normalRange: { min: -10, max: 60 },
    displayRange: { min: -40, max: 215 },
  },
  "10": {
    pid: "10",
    name: "MAF Air Flow Rate",
    unit: "g/s",
    bytes: 2,
    decode: ([a, b]) => (a * 256 + b) / 100,
    normalRange: { min: 1, max: 150 },
    displayRange: { min: 0, max: 655.35 },
  },
  "11": {
    pid: "11",
    name: "Throttle Position",
    unit: "%",
    bytes: 1,
    decode: ([a]) => (a * 100) / 255,
    normalRange: { min: 0, max: 100 },
    displayRange: { min: 0, max: 100 },
  },
  "14": {
    pid: "14",
    name: "O2 Sensor (Bank 1, Sensor 1)",
    unit: "V",
    bytes: 2,
    // Byte B carries short term fuel trim and is intentionally ignored here.
    decode: ([a]) => a / 200,
    normalRange: { min: 0.1, max: 0.9 },
    displayRange: { min: 0, max: 1.275 },
  },
  "2F": {
    pid: "2F",
    name: "Fuel Tank Level",
    unit: "%",
    bytes: 1,
    decode: ([a]) => (a * 100) / 255,
    normalRange: { min: 10, max: 100 },
    displayRange: { min: 0, max: 100 },
  },
  "42": {
    pid: "42",
    name: "Control Module Voltage",
    unit: "V",
    bytes: 2,
    decode: ([a, b]) => (a * 256 + b) / 1000,
    normalRange: { min: 12, max: 14.8 },
    displayRange: { min: 0, max: 65.535 },
  },
  "5C": {
    pid: "5C",
    name: "Engine Oil Temperature",
    unit: "°C",
    bytes: 1,
    decode: ([a]) => a - 40,
    normalRange: { min: 70, max: 120 },
    displayRange: { min: -40, max: 210 },
  },
};

/** PIDs polled during a standard live scan, in request order. */
export const DEFAULT_SCAN_PIDS = ["0C", "0D", "05", "0A", "14"] as const;

export function getPidDefinition(pid: string): PidDefinition | undefined {
  return PID_DEFINITIONS[pid.toUpperCase()];
}

export function isNormalReading(
  definition: PidDefinition,
  value: number
): boolean {
  if (!definition.normalRange) return true;
  return (
    value >= definition.normalRange.min && value <= definition.normalRange.max
  );
}

/** Round to at most 4 decimals — the precision the parameter column stores. */
export function roundReading(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Strip everything an ELM327 adds around the payload: the echoed command, the
 * "SEARCHING..." notice, CAN headers when ATH1 is on, whitespace and the ">"
 * prompt. Returns the remaining hex byte values.
 */
export function extractHexBytes(response: string): number[] {
  const cleaned = response
    .replace(/[\r\n]+/g, " ")
    .replace(/>/g, " ")
    .replace(/SEARCHING\.\.\./gi, " ")
    .trim();

  const bytes: number[] = [];
  for (const token of cleaned.split(/\s+/)) {
    // ATS0 packs bytes together, so a token may hold several of them.
    if (!/^[0-9A-Fa-f]+$/.test(token) || token.length % 2 !== 0) continue;
    for (let i = 0; i < token.length; i += 2) {
      bytes.push(parseInt(token.slice(i, i + 2), 16));
    }
  }
  return bytes;
}

export class ObdProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObdProtocolError";
  }
}

/** Responses an ELM327 returns instead of data. */
const ELM_ERROR_RESPONSES = [
  "NO DATA",
  "UNABLE TO CONNECT",
  "BUS INIT",
  "BUS ERROR",
  "CAN ERROR",
  "DATA ERROR",
  "STOPPED",
  "ERROR",
  "?",
];

export function findElmError(response: string): string | null {
  const upper = response.toUpperCase();
  return (
    ELM_ERROR_RESPONSES.find(candidate => upper.includes(candidate)) ?? null
  );
}

/**
 * Decode a Mode 01 response for `pid`.
 *
 * Locates the `41 <pid>` response header inside the byte stream, so it works
 * whether or not CAN headers are enabled, and returns null when the ECU had
 * nothing to report.
 */
export function decodeMode01Response(
  pid: string,
  response: string
): number | null {
  const elmError = findElmError(response);
  if (elmError) {
    throw new ObdProtocolError(`Adapter returned "${elmError}" for PID ${pid}`);
  }

  const definition = getPidDefinition(pid);
  if (!definition) {
    throw new ObdProtocolError(`Unsupported PID ${pid}`);
  }

  const bytes = extractHexBytes(response);
  const pidValue = parseInt(pid, 16);

  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] !== 0x41 || bytes[i + 1] !== pidValue) continue;

    const payload = bytes.slice(i + 2, i + 2 + definition.bytes);
    if (payload.length < definition.bytes) {
      throw new ObdProtocolError(
        `Truncated response for PID ${pid}: expected ${definition.bytes} data byte(s), got ${payload.length}`
      );
    }
    return roundReading(definition.decode(payload));
  }

  return null;
}

export interface DecodedDtc {
  code: string;
  system: string;
}

const DTC_LETTERS = ["P", "C", "B", "U"] as const;
const DTC_SYSTEMS: Record<(typeof DTC_LETTERS)[number], string> = {
  P: "Powertrain",
  C: "Chassis",
  B: "Body",
  U: "Network",
};

/**
 * Decode a single two-byte DTC per SAE J2012.
 *
 * Bits 15-14 select the letter, bits 13-12 the first digit, the remaining
 * 12 bits are three hex digits.
 */
export function decodeDtcBytes(a: number, b: number): DecodedDtc | null {
  if (a === 0 && b === 0) return null; // padding for an unused slot

  const letter = DTC_LETTERS[(a >> 6) & 0x03];
  const digit1 = (a >> 4) & 0x03;
  const digit2 = (a & 0x0f).toString(16).toUpperCase();
  const digit3 = ((b >> 4) & 0x0f).toString(16).toUpperCase();
  const digit4 = (b & 0x0f).toString(16).toUpperCase();

  return {
    code: `${letter}${digit1}${digit2}${digit3}${digit4}`,
    system: DTC_SYSTEMS[letter],
  };
}

/**
 * How to treat the byte following `43` in a Mode 03 response.
 *
 * ISO 15765 (CAN) always sends a DTC count there; the older ISO 9141 / KWP /
 * J1850 protocols send DTC pairs immediately. Some payloads parse validly both
 * ways — `43 01 43 00 00` is either one C0300 or one P0143 with padding — so
 * this is a caller decision, not something to guess from the bytes.
 */
export type CountByteMode = "auto" | "present" | "absent";

/**
 * Decode a Mode 03 (stored DTC) response.
 *
 * `countByte: "auto"` accepts the count reading when it exactly explains the
 * remaining payload (trailing zero padding allowed) and falls back to "absent"
 * otherwise. Where both readings fit, CAN wins, because every OBD-II vehicle
 * built from 2008 on uses it. Pass "present" or "absent" explicitly when the
 * negotiated protocol is known.
 */
export function decodeMode03Response(
  response: string,
  options: { countByte?: CountByteMode } = {}
): DecodedDtc[] {
  const { countByte = "auto" } = options;

  const elmError = findElmError(response);
  if (elmError) {
    if (elmError === "NO DATA") return []; // no stored codes is a valid answer
    throw new ObdProtocolError(
      `Adapter returned "${elmError}" while reading DTCs`
    );
  }

  const bytes = extractHexBytes(response);
  const start = bytes.indexOf(0x43);
  if (start === -1) return [];

  let cursor = start + 1;
  if (countByte === "present") {
    cursor += 1;
  } else if (countByte === "auto") {
    const candidate = bytes[cursor];
    const payload = bytes.slice(cursor + 1);
    const declared = (candidate ?? 0) * 2;
    const restIsPadding = payload.slice(declared).every(byte => byte === 0x00);
    if (
      candidate !== undefined &&
      declared <= payload.length &&
      restIsPadding
    ) {
      cursor += 1;
    }
  }

  const codes: DecodedDtc[] = [];
  const seen = new Set<string>();
  for (let i = cursor; i + 1 < bytes.length; i += 2) {
    const decoded = decodeDtcBytes(bytes[i], bytes[i + 1]);
    if (!decoded || seen.has(decoded.code)) continue;
    seen.add(decoded.code);
    codes.push(decoded);
  }
  return codes;
}

/**
 * Severity for a DTC without any LLM involvement.
 *
 * Deliberately conservative: it is the floor the UI can rely on when the LLM is
 * unavailable, not a diagnosis.
 */
const CRITICAL_CODES = new Set([
  "P0300",
  "P0301",
  "P0302",
  "P0303",
  "P0304",
  "P0606",
  "P0335",
]);
const ERROR_CODES_SET = new Set(["P0420", "P0430", "P0171", "P0172", "P0128"]);

export function severityForCode(code: string): Severity {
  const normalized = code.toUpperCase();
  if (CRITICAL_CODES.has(normalized)) return "critical";
  if (ERROR_CODES_SET.has(normalized)) return "error";
  if (normalized.startsWith("U")) return "error"; // network faults break other systems
  if (normalized.startsWith("B")) return "info"; // body codes are rarely drivability issues
  return "warning";
}
