import { EventEmitter } from "events";
import { SerialPort } from "serialport";
import {
  DEFAULT_SCAN_PIDS,
  decodeMode01Response,
  decodeMode03Response,
  getPidDefinition,
  isNormalReading,
  ObdProtocolError,
  severityForCode,
  type CountByteMode,
  type Severity,
} from "./protocol";

/**
 * OBD Hardware Manager
 *
 * Owns the serial transport to ELM327 and D-CAN adapters. An ELM327 is a
 * strictly request/response device with a single outstanding command: it writes
 * a command, streams the answer, then prints a ">" prompt. Everything here is
 * built around that fact — commands per port run through one queue, and a
 * response is only complete once the prompt arrives.
 *
 * Wire-format decoding lives in protocol.ts so it can be tested without hardware.
 */

export type DeviceType = "elm327" | "dcan";

export interface OBDDevice {
  port: string;
  baudRate: number;
  type: DeviceType;
  isConnected: boolean;
  lastUpdate: Date;
}

export interface OBDParameter {
  pid: string;
  name: string;
  value: number;
  unit: string;
  isNormal: boolean;
  timestamp: Date;
  /** Always false here — this manager only reports real hardware readings. */
  isSimulated: false;
}

export interface OBDError {
  code: string;
  description: string;
  severity: Severity;
  system: string;
}

interface PendingCommand {
  command: string;
  timeoutMs: number;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

interface Connection {
  serialPort: SerialPort;
  state: OBDDevice;
  /** Bytes received since the last ">" prompt. */
  buffer: string;
  /** Commands waiting to be written; the head is the one in flight. */
  queue: PendingCommand[];
  inFlight: PendingCommand | null;
  timer: NodeJS.Timeout | null;
  countByte: CountByteMode;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 5000;
/** ELM327 resets take noticeably longer than a data request. */
const RESET_TIMEOUT_MS = 10000;
const ELM_PROMPT = ">";

export class OBDManager extends EventEmitter {
  private connections: Map<string, Connection> = new Map();
  private scanTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Ports with a scan cycle currently in flight, to stop cycles overlapping. */
  private scanning: Set<string> = new Set();

  /**
   * Open a serial connection and run the adapter initialisation sequence.
   *
   * Resolves once the adapter has answered the init commands, so a caller that
   * gets `true` can immediately request data.
   */
  async connectDevice(
    port: string,
    type: DeviceType = "elm327",
    baudRate: number = 38400
  ): Promise<boolean> {
    if (this.connections.has(port)) {
      throw new Error(`Port ${port} is already connected`);
    }

    const serialPort = new SerialPort({
      path: port,
      baudRate,
      autoOpen: false,
    });

    const connection: Connection = {
      serialPort,
      state: {
        port,
        baudRate,
        type,
        isConnected: false,
        lastUpdate: new Date(),
      },
      buffer: "",
      queue: [],
      inFlight: null,
      timer: null,
      countByte: type === "dcan" ? "present" : "auto",
    };

    serialPort.on("data", chunk =>
      this.handleData(port, chunk.toString("ascii"))
    );
    serialPort.on("error", error => {
      console.error(`[OBD] Error on ${port}:`, error);
      this.emit("error", { port, error: error.message });
    });
    serialPort.on("close", () => {
      console.log(`[OBD] Disconnected from ${port}`);
      this.failAllPending(port, new Error("Serial port closed"));
      const existing = this.connections.get(port);
      if (existing) existing.state.isConnected = false;
      this.stopScanning(port);
      this.connections.delete(port);
      this.emit("disconnected", { port });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        serialPort.open(error => (error ? reject(error) : resolve()));
      });

      // Only register once the port is actually open, otherwise a failed open
      // would leave a dead entry behind that blocks every later attempt.
      connection.state.isConnected = true;
      this.connections.set(port, connection);

      await this.initializeDevice(port, type);

      console.log(`[OBD] Connected to ${port} (${type}, ${baudRate} baud)`);
      this.emit("connected", { port, type });
      return true;
    } catch (error) {
      this.connections.delete(port);
      this.failAllPending(
        port,
        error instanceof Error ? error : new Error(String(error))
      );
      if (serialPort.isOpen) {
        await new Promise<void>(resolve => serialPort.close(() => resolve()));
      }
      serialPort.removeAllListeners();
      console.error(`[OBD] Failed to connect to ${port}:`, error);
      this.emit("error", { port, error: String(error) });
      return false;
    }
  }

  /**
   * Run the adapter setup sequence, waiting for each command to be acknowledged.
   *
   * The previous implementation fired these on staggered `setTimeout`s without
   * reading the replies, so a device that was still busy silently dropped them.
   */
  private async initializeDevice(
    port: string,
    type: DeviceType
  ): Promise<void> {
    const commands: { cmd: string; timeoutMs?: number }[] = [
      { cmd: "ATZ", timeoutMs: RESET_TIMEOUT_MS }, // reset
      { cmd: "ATE0" }, // echo off
      { cmd: "ATL0" }, // linefeeds off
      { cmd: "ATS0" }, // spaces off
      { cmd: "ATH0" }, // headers off — protocol.ts does not need them
      { cmd: "ATST32" }, // ~200 ms adapter timeout
      // Auto-detect for ELM327; D-CAN adapters are pinned to 11-bit 500 kbps CAN.
      { cmd: type === "dcan" ? "ATSP6" : "ATSP0" },
    ];

    for (const { cmd, timeoutMs } of commands) {
      const response = await this.sendCommand(port, cmd, timeoutMs);
      if (/^\s*\?/.test(response)) {
        throw new Error(`Adapter rejected initialisation command ${cmd}`);
      }
    }
  }

  /**
   * Queue a command and resolve with the adapter's reply.
   *
   * Serialising per port is what makes concurrent reads correct: an ELM327 has
   * no request ids, so two commands in flight at once cannot be told apart.
   */
  sendCommand(
    port: string,
    command: string,
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS
  ): Promise<string> {
    const connection = this.connections.get(port);
    if (!connection || !connection.serialPort.isOpen) {
      return Promise.reject(new Error(`Port ${port} is not open`));
    }

    return new Promise<string>((resolve, reject) => {
      connection.queue.push({ command, timeoutMs, resolve, reject });
      this.drainQueue(port);
    });
  }

  private drainQueue(port: string): void {
    const connection = this.connections.get(port);
    if (!connection || connection.inFlight) return;

    const next = connection.queue.shift();
    if (!next) return;

    connection.inFlight = next;
    connection.buffer = "";

    connection.timer = setTimeout(() => {
      this.settleInFlight(
        port,
        new Error(
          `Timed out after ${next.timeoutMs}ms waiting for "${next.command}"`
        )
      );
    }, next.timeoutMs);

    connection.serialPort.write(`${next.command}\r`, error => {
      if (error) {
        this.settleInFlight(port, error);
      }
    });
  }

  /**
   * Resolve or reject the in-flight command and start the next one.
   *
   * Every exit path for a command goes through here, so the timer is always
   * cleared and the queue never stalls.
   */
  private settleInFlight(
    port: string,
    errorOrResponse: Error | { response: string }
  ): void {
    const connection = this.connections.get(port);
    if (!connection) return;

    const pending = connection.inFlight;
    if (!pending) return;

    if (connection.timer) {
      clearTimeout(connection.timer);
      connection.timer = null;
    }
    connection.inFlight = null;
    connection.buffer = "";

    if (errorOrResponse instanceof Error) {
      pending.reject(errorOrResponse);
    } else {
      pending.resolve(errorOrResponse.response);
    }

    this.drainQueue(port);
  }

  private failAllPending(port: string, error: Error): void {
    const connection = this.connections.get(port);
    if (!connection) return;

    if (connection.timer) {
      clearTimeout(connection.timer);
      connection.timer = null;
    }
    const pending = connection.inFlight
      ? [connection.inFlight, ...connection.queue]
      : [...connection.queue];
    connection.inFlight = null;
    connection.queue = [];
    connection.buffer = "";
    for (const command of pending) command.reject(error);
  }

  /**
   * Accumulate serial data until the ">" prompt marks the response complete.
   *
   * Serial data arrives in arbitrary chunks, so a single `data` event is not a
   * response and cannot be decoded on its own.
   */
  private handleData(port: string, chunk: string): void {
    const connection = this.connections.get(port);
    if (!connection) return;

    connection.state.lastUpdate = new Date();
    connection.buffer += chunk;
    this.emit("data", { port, raw: chunk });

    const promptIndex = connection.buffer.indexOf(ELM_PROMPT);
    if (promptIndex === -1) return;

    const response = connection.buffer.slice(0, promptIndex);
    const rest = connection.buffer.slice(promptIndex + 1);

    if (connection.inFlight) {
      this.settleInFlight(port, { response });
      // Anything after the prompt belongs to the next response.
      const current = this.connections.get(port);
      if (current) current.buffer = rest;
    } else {
      // Unsolicited output (for example after a device-side reset).
      connection.buffer = rest;
    }
  }

  /**
   * Read a single Mode 01 PID.
   *
   * Returns null when the ECU does not report the PID; throws when the adapter
   * or the transport fails, so callers can tell "not supported" from "broken".
   */
  async requestParameter(
    port: string,
    pid: string
  ): Promise<OBDParameter | null> {
    const definition = getPidDefinition(pid);
    if (!definition) {
      throw new ObdProtocolError(`Unsupported PID ${pid}`);
    }

    const response = await this.sendCommand(port, `01${definition.pid}`);
    const value = decodeMode01Response(definition.pid, response);
    if (value === null) return null;

    return {
      pid: definition.pid,
      name: definition.name,
      value,
      unit: definition.unit,
      isNormal: isNormalReading(definition, value),
      timestamp: new Date(),
      isSimulated: false,
    };
  }

  /**
   * Poll the standard live parameters on an interval.
   *
   * A cycle is skipped while the previous one is still running: five PIDs at up
   * to the command timeout each can take longer than the interval, and stacking
   * cycles would queue commands faster than the adapter can answer them.
   */
  startScanning(
    port: string,
    intervalMs: number = 1000,
    pids: readonly string[] = DEFAULT_SCAN_PIDS
  ): void {
    if (this.scanTimers.has(port)) {
      console.warn(`[OBD] Scanning already active on ${port}`);
      return;
    }

    // setInterval ignores the returned promise, so the cycle is wrapped in a
    // void call and every rejection is handled inside runCycle.
    const runCycle = async () => {
      const connection = this.connections.get(port);
      if (!connection || !connection.state.isConnected) {
        this.stopScanning(port);
        return;
      }
      if (this.scanning.has(port)) return;

      this.scanning.add(port);
      try {
        for (const pid of pids) {
          if (!this.connections.has(port)) break;
          try {
            const parameter = await this.requestParameter(port, pid);
            if (parameter) this.emit("parameter", { port, parameter });
          } catch (error) {
            this.emit("parameterError", {
              port,
              pid,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } finally {
        this.scanning.delete(port);
      }
    };

    const timer = setInterval(() => void runCycle(), intervalMs);

    this.scanTimers.set(port, timer);
    console.log(
      `[OBD] Started scanning on ${port} (interval: ${intervalMs}ms)`
    );
  }

  stopScanning(port: string): void {
    const timer = this.scanTimers.get(port);
    if (timer) {
      clearInterval(timer);
      this.scanTimers.delete(port);
      console.log(`[OBD] Stopped scanning on ${port}`);
    }
    this.scanning.delete(port);
  }

  async disconnectDevice(port: string): Promise<void> {
    this.stopScanning(port);

    const connection = this.connections.get(port);
    if (!connection) return;

    this.failAllPending(port, new Error("Device disconnected"));

    if (connection.serialPort.isOpen) {
      await new Promise<void>(resolve =>
        connection.serialPort.close(() => resolve())
      );
    }
    connection.serialPort.removeAllListeners();
    this.connections.delete(port);
  }

  /** Close every open port. Used on server shutdown. */
  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.connections.keys()).map(port =>
        this.disconnectDevice(port)
      )
    );
  }

  async getAvailablePorts(): Promise<
    { path: string; manufacturer?: string }[]
  > {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
      }));
    } catch (error) {
      console.error("[OBD] Error listing ports:", error);
      return [];
    }
  }

  getConnectionStatus(port: string): OBDDevice | null {
    return this.connections.get(port)?.state ?? null;
  }

  getAllConnections(): OBDDevice[] {
    return Array.from(this.connections.values()).map(
      connection => connection.state
    );
  }

  /** Read stored diagnostic trouble codes (Mode 03). */
  async readErrorCodes(port: string): Promise<OBDError[]> {
    const connection = this.connections.get(port);
    if (!connection) {
      throw new Error(`Port ${port} is not open`);
    }

    const response = await this.sendCommand(port, "03");
    const decoded = decodeMode03Response(response, {
      countByte: connection.countByte,
    });

    return decoded.map(({ code, system }) => ({
      code,
      // The human-readable text comes from the LLM layer; the adapter only
      // reports the code itself.
      description: "",
      severity: severityForCode(code),
      system,
    }));
  }

  /**
   * Clear stored trouble codes (Mode 04).
   *
   * This also erases freeze-frame data and resets readiness monitors on the
   * vehicle. Callers must confirm with the user first — it cannot be undone.
   */
  async clearErrorCodes(port: string): Promise<boolean> {
    const response = await this.sendCommand(port, "04");
    // A successful clear is acknowledged with 44.
    return /44/.test(response.replace(/\s/g, ""));
  }
}

// Export singleton instance
export const obdManager = new OBDManager();
