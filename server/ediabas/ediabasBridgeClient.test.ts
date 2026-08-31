import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import {
  EdiabasBridgeClient,
  type EdiabasBridgeResponse,
} from "./ediabasBridgeClient";

type CommandHandler = (command: string, child: FakeChildProcess) => void;

class FakeChildProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();

  exitCode: number | null = null;
  killed = false;

  private inputBuffer = "";

  constructor(private readonly onCommand: CommandHandler) {
    super();

    this.stdin.on("data", chunk => {
      this.inputBuffer += chunk.toString("utf8");

      while (true) {
        const newline = this.inputBuffer.indexOf("\n");

        if (newline === -1) {
          break;
        }

        const line = this.inputBuffer.slice(0, newline).trim();
        this.inputBuffer = this.inputBuffer.slice(newline + 1);

        if (!line) {
          continue;
        }

        const parsed = JSON.parse(line) as { command: string };
        this.onCommand(parsed.command, this);
      }
    });

    this.stdin.on("finish", () => {
      this.exit(0, null);
    });

    queueMicrotask(() => {
      this.emit("spawn");
    });
  }

  respond(response: EdiabasBridgeResponse): void {
    this.stdout.write(`${JSON.stringify(response)}\n`);
  }

  kill(): boolean {
    this.killed = true;
    this.exit(1, "SIGTERM");
    return true;
  }

  private exit(code: number, signal: string | null): void {
    if (this.exitCode !== null) {
      return;
    }

    this.exitCode = code;
    this.emit("exit", code, signal);
  }
}

function successResponse(
  command: string,
  results: unknown = {}
): EdiabasBridgeResponse {
  return {
    success: true,
    command,
    ecu: null,
    job: null,
    durationMs: 1,
    results,
    error: null,
  };
}

function installFakeBridge(handler: CommandHandler): FakeChildProcess {
  const fake = new FakeChildProcess(handler);

  spawnMock.mockReturnValue(
    fake as unknown as ChildProcessWithoutNullStreams
  );

  return fake;
}

describe("EdiabasBridgeClient", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("starts the bridge and performs health as the first request", async () => {
    const commands: string[] = [];

    installFakeBridge((command, child) => {
      commands.push(command);

      if (command === "health") {
        child.respond(
          successResponse("health", {
            processBitness: 32,
            mode: "FIXED_READ_ONLY_DISCOVERY",
          })
        );
      }
    });

    const client = new EdiabasBridgeClient({
      bridgePath: "fake-bridge.exe",
    });

    await client.start();

    expect(client.isRunning).toBe(true);
    expect(commands).toEqual(["health"]);

    await client.stop();

    expect(client.isRunning).toBe(false);
  });

  it("sends commands strictly one at a time", async () => {
    const commands: string[] = [];

    installFakeBridge((command, child) => {
      commands.push(command);

      if (command === "health") {
        child.respond(successResponse("health"));
        return;
      }

      if (command === "first") {
        setTimeout(() => {
          child.respond(successResponse("first"));
        }, 30);

        return;
      }

      if (command === "second") {
        child.respond(successResponse("second"));
      }
    });

    const client = new EdiabasBridgeClient({
      bridgePath: "fake-bridge.exe",
      timeoutMs: 1_000,
    });

    await client.start();

    const first = client.send("first");
    const second = client.send("second");

    await new Promise(resolve => setTimeout(resolve, 5));

    /*
     * "second" must still be waiting in the client queue because the bridge has
     * not yet answered "first".
     */
    expect(commands).toEqual(["health", "first"]);

    const [firstResponse, secondResponse] = await Promise.all([
      first,
      second,
    ]);

    expect(firstResponse.command).toBe("first");
    expect(secondResponse.command).toBe("second");
    expect(commands).toEqual(["health", "first", "second"]);

    await client.stop();
  });

  it("rejects a response whose command does not match the pending request", async () => {
    const fake = installFakeBridge((command, child) => {
      if (command === "health") {
        child.respond(successResponse("health"));
        return;
      }

      if (command === "expected-command") {
        child.respond(successResponse("different-command"));
      }
    });

    const client = new EdiabasBridgeClient({
      bridgePath: "fake-bridge.exe",
    });

    await client.start();

    await expect(client.send("expected-command")).rejects.toThrow(
      "response mismatch"
    );

    expect(fake.killed).toBe(true);
    expect(client.isRunning).toBe(false);
  });

  it("terminates the bridge after a command timeout", async () => {
    const fake = installFakeBridge((command, child) => {
      if (command === "health") {
        child.respond(successResponse("health"));
      }

      /*
       * Intentionally never answer "hang".
       */
    });

    const client = new EdiabasBridgeClient({
      bridgePath: "fake-bridge.exe",
      timeoutMs: 25,
    });

    await client.start();

    await expect(client.send("hang")).rejects.toThrow(
      "timed out after 25 ms"
    );

    expect(fake.killed).toBe(true);
    expect(client.isRunning).toBe(false);
  });
});