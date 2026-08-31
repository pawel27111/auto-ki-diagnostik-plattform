import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

export interface EdiabasBridgeError {
  code: string;
  message: string;
  phase: string;
}

export interface EdiabasBridgeResponse {
  success: boolean;
  command: string | null;
  ecu: string | null;
  job: string | null;
  durationMs: number;
  results: unknown;
  error: EdiabasBridgeError | null;
}

export interface EdiabasBridgeClientOptions {
  bridgePath: string;
  ediabasBinPath?: string;
  ecuPath?: string;
  timeoutMs?: number;
}

interface PendingRequest {
  command: string;
  resolve: (response: EdiabasBridgeResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class EdiabasBridgeClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private lines: ReadlineInterface | null = null;

  private queue: Array<{
    command: string;
    resolve: (response: EdiabasBridgeResponse) => void;
    reject: (error: Error) => void;
  }> = [];

  private pending: PendingRequest | null = null;
  private stopping = false;

  private readonly timeoutMs: number;

  constructor(private readonly options: EdiabasBridgeClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 35_000;
  }

  get isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.stopping = false;

    const args: string[] = [];

    if (this.options.ediabasBinPath) {
      args.push("--ediabas-bin", this.options.ediabasBinPath);
    }

    if (this.options.ecuPath) {
      args.push("--ecu-path", this.options.ecuPath);
    }

    const child = spawn(this.options.bridgePath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process = child;

    child.stderr.setEncoding("utf8");
    child.stdout.setEncoding("utf8");

    child.stderr.on("data", data => {
      const text = String(data).trim();

      if (text.length > 0) {
        console.error(`[EDIABAS Bridge] ${text}`);
      }
    });

    child.once("error", error => {
      this.handleProcessFailure(
        new Error(`EDIABAS bridge could not be started: ${error.message}`)
      );
    });

    child.once("exit", (code, signal) => {
      const expected = this.stopping;

      this.process = null;

      this.lines?.close();
      this.lines = null;

      if (!expected) {
        this.handleProcessFailure(
          new Error(
            `EDIABAS bridge exited unexpectedly ` +
              `(code=${String(code)}, signal=${String(signal)})`
          )
        );
      }
    });

    this.lines = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    this.lines.on("line", line => {
      this.handleResponseLine(line);
    });

    /*
     * "spawn" tells us Windows has successfully created the process.
     * We deliberately do not consider the bridge ready merely because
     * ChildProcess exists.
     */
    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        child.off("spawn", onSpawn);
        child.off("error", onError);
      };

      child.once("spawn", onSpawn);
      child.once("error", onError);
    });

    /*
     * Health is deliberately the first protocol request.
     * The C# bridge handles it without executing an EDIABAS vehicle job.
     */
    const health = await this.send("health");

    if (!health.success) {
      await this.stop();

      throw new Error(
        `EDIABAS bridge health check failed: ` +
          `${health.error?.code ?? "UNKNOWN"} - ` +
          `${health.error?.message ?? "unknown error"}`
      );
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;

    const process = this.process;

    if (!process) {
      this.rejectAll(new Error("EDIABAS bridge stopped"));
      return;
    }

    this.process = null;

    this.rejectAll(new Error("EDIABAS bridge stopped"));

    this.lines?.close();
    this.lines = null;

    /*
     * Closing stdin lets the C# ReadLine loop reach EOF and exit normally.
     */
    process.stdin.end();

    await new Promise<void>(resolve => {
      if (process.exitCode !== null) {
        resolve();
        return;
      }

      const forceTimer = setTimeout(() => {
        if (process.exitCode === null) {
          process.kill();
        }
      }, 2_000);

      process.once("exit", () => {
        clearTimeout(forceTimer);
        resolve();
      });
    });
  }

  send(command: string): Promise<EdiabasBridgeResponse> {
    if (!command.trim()) {
      return Promise.reject(new Error("EDIABAS command must not be empty"));
    }

    if (!this.process || this.process.exitCode !== null) {
      return Promise.reject(new Error("EDIABAS bridge is not running"));
    }

    return new Promise<EdiabasBridgeResponse>((resolve, reject) => {
      this.queue.push({
        command,
        resolve,
        reject,
      });

      this.drainQueue();
    });
  }

  health(): Promise<EdiabasBridgeResponse> {
    return this.send("health");
  }

  private drainQueue(): void {
    if (this.pending !== null) {
      return;
    }

    const process = this.process;

    if (!process || process.exitCode !== null) {
      this.rejectAll(new Error("EDIABAS bridge is not running"));
      return;
    }

    const next = this.queue.shift();

    if (!next) {
      return;
    }

    const timer = setTimeout(() => {
      const pending = this.pending;

      if (!pending) {
        return;
      }

      this.pending = null;

      pending.reject(
        new Error(
          `EDIABAS bridge command '${pending.command}' timed out after ` +
            `${this.timeoutMs} ms`
        )
      );

      /*
       * After a protocol timeout we cannot safely know whether the next line
       * belongs to the old or a new request. Do not send another command into
       * an ambiguous stream.
       */
      this.handleProcessFailure(
        new Error(
          `EDIABAS bridge protocol became unsynchronised after timeout ` +
            `on '${pending.command}'`
        )
      );
    }, this.timeoutMs);

    this.pending = {
      command: next.command,
      resolve: next.resolve,
      reject: next.reject,
      timer,
    };

    const payload = JSON.stringify({
      command: next.command,
    });

    process.stdin.write(`${payload}\n`, "utf8", error => {
      if (!error) {
        return;
      }

      const pending = this.pending;

      if (pending) {
        clearTimeout(pending.timer);
        this.pending = null;
        pending.reject(error);
      }

      this.handleProcessFailure(
        new Error(`Failed to write to EDIABAS bridge: ${error.message}`)
      );
    });
  }

  private handleResponseLine(line: string): void {
    const pending = this.pending;

    if (!pending) {
      console.error(
        `[EDIABAS Bridge] Unexpected response without pending request: ${line}`
      );
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      clearTimeout(pending.timer);
      this.pending = null;

      pending.reject(
        new Error(`EDIABAS bridge returned invalid JSON: ${line}`)
      );

      this.handleProcessFailure(
        new Error("EDIABAS bridge protocol returned invalid JSON")
      );

      return;
    }

    if (!this.isBridgeResponse(parsed)) {
      clearTimeout(pending.timer);
      this.pending = null;

      pending.reject(
        new Error("EDIABAS bridge returned an invalid response structure")
      );

      this.handleProcessFailure(
        new Error("EDIABAS bridge protocol response validation failed")
      );

      return;
    }

    clearTimeout(pending.timer);
    this.pending = null;

    /*
     * Since the C# protocol currently has no request id, command equality is
     * our additional defence against accidentally pairing the wrong response.
     */
    if (parsed.command !== pending.command) {
      pending.reject(
        new Error(
          `EDIABAS bridge response mismatch: expected '${pending.command}', ` +
            `received '${String(parsed.command)}'`
        )
      );

      this.handleProcessFailure(
        new Error("EDIABAS bridge response order became inconsistent")
      );

      return;
    }

    pending.resolve(parsed);

    this.drainQueue();
  }

  private isBridgeResponse(value: unknown): value is EdiabasBridgeResponse {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const response = value as Record<string, unknown>;

    return (
      typeof response.success === "boolean" &&
      (typeof response.command === "string" || response.command === null) &&
      typeof response.durationMs === "number" &&
      "results" in response &&
      "error" in response
    );
  }

  private handleProcessFailure(error: Error): void {
    this.rejectAll(error);

    const process = this.process;

    this.process = null;

    this.lines?.close();
    this.lines = null;

    if (process && process.exitCode === null) {
      process.kill();
    }
  }

  private rejectAll(error: Error): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }

    for (const queued of this.queue.splice(0)) {
      queued.reject(error);
    }
  }
}