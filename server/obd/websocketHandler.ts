import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { randomUUID } from "node:crypto";
import type { Server as HTTPServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { z } from "zod";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { obdManager, type OBDError, type OBDParameter } from "./obdManager";

/**
 * WebSocket handler for real-time OBD data streaming.
 *
 * Security model:
 * - Every connection is authenticated during the Socket.io handshake using the
 *   same session cookie as the HTTP API. Unauthenticated sockets are rejected
 *   before any handler is wired up.
 * - Session ids are generated server-side. A client-supplied id would let one
 *   client name, and therefore take over, another client's session.
 * - Serial port paths arrive from the browser, so they are checked against an
 *   explicit allow list rather than passed to the OS as given.
 * - Readings are broadcast only to the session that owns the port they came
 *   from; broadcasting to every active session leaked one vehicle's data to
 *   another user's screen.
 */

/** Readings retained per session. The UI shows a short tail; this bounds memory. */
const MAX_SESSION_PARAMETERS = 500;

export interface DiagnosticSession {
  id: string;
  userId: number;
  vehicleId: number;
  /** Optional database diagnostic this live session persists into. */
  diagnosticId: number | null;
  port: string;
  isActive: boolean;
  startTime: Date;
  parameters: OBDParameter[];
  errorCodes: OBDError[];
}

interface SocketData {
  user: User;
  sessionIds: Set<string>;
}

/**
 * Events the server emits. Declaring them gives `socket.emit` a checked
 * signature, so a renamed field or a typo in an event name is a compile error
 * rather than a payload the client silently never receives.
 */
interface ServerToClientEvents {
  "diagnostic:started": (payload: { sessionId: string; port: string; vehicleId: number }) => void;
  "diagnostic:stopped": (payload: {
    sessionId: string;
    parameters: OBDParameter[];
    errorCodes: OBDError[];
  }) => void;
  "parameter:update": (payload: { sessionId: string; parameter: OBDParameter }) => void;
  "parameter:response": (payload: { sessionId: string; parameter: OBDParameter }) => void;
  "parameter:error": (payload: { sessionId: string; pid: string; error: string }) => void;
  "errorcode:update": (payload: { sessionId: string; errorCodes: OBDError[] }) => void;
  "errorcode:cleared": (payload: { sessionId: string }) => void;
  "obd:connected": (payload: { sessionId: string; port: string }) => void;
  "obd:disconnected": (payload: { sessionId: string; port: string }) => void;
  "obd:error": (payload: { sessionId: string; port: string; error?: string }) => void;
  error: (payload: { event: string; message: string }) => void;
}

type AuthedSocket = Socket<Record<string, never>, ServerToClientEvents, Record<string, never>, SocketData>;

type Ack = (result: { ok: true; data?: unknown } | { ok: false; error: string }) => void;

const startSchema = z.object({
  vehicleId: z.number().int().positive(),
  port: z.string().min(1).max(255),
  diagnosticId: z.number().int().positive().optional(),
  intervalMs: z.number().int().min(250).max(60_000).optional(),
});
const sessionSchema = z.object({ sessionId: z.string().uuid() });
const parameterRequestSchema = sessionSchema.extend({
  pid: z
    .string()
    .regex(/^[0-9A-Fa-f]{2}$/, "PID must be two hex digits"),
});
const clearSchema = sessionSchema.extend({
  /** Explicit opt-in; clearing DTCs also wipes freeze frames and readiness monitors. */
  confirm: z.literal(true),
});

export class WebSocketHandler {
  private io: SocketIOServer<Record<string, never>, ServerToClientEvents, Record<string, never>, SocketData>;
  private sessions: Map<string, DiagnosticSession> = new Map();
  /** Port -> session id, so a reading can be routed to exactly one session. */
  private portSessions: Map<string, string> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer<Record<string, never>, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
      path: "/api/socket.io",
      cors: {
        // Empty list means same-origin only: no Access-Control-Allow-Origin is
        // emitted, so a page on another origin cannot open a connection.
        origin: ENV.allowedOrigins.length > 0 ? ENV.allowedOrigins : false,
        credentials: true,
        methods: ["GET", "POST"],
      },
    });

    this.io.use((socket, next) => {
      this.authenticate(socket as AuthedSocket).then(
        () => next(),
        error => {
          console.warn("[WebSocket] Rejected connection:", error.message);
          next(new Error("Unauthorized"));
        }
      );
    });

    this.setupHandlers();
    this.setupOBDListeners();
  }

  /**
   * Resolve the session cookie into a user, or throw.
   *
   * Runs as handshake middleware, so an unauthenticated socket never reaches
   * any event handler.
   */
  private async authenticate(socket: AuthedSocket): Promise<void> {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) throw new Error("Missing session cookie");

    const token = parseCookieHeader(cookieHeader)[COOKIE_NAME];
    const session = await sdk.verifySession(token);
    if (!session) throw new Error("Invalid session cookie");

    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw new Error("Unknown user");

    socket.data.user = user;
    socket.data.sessionIds = new Set();
  }

  /**
   * Check a client-supplied serial port against the configured allow list.
   *
   * Without this the path is handed straight to the OS, so any device file on
   * the host would be reachable from the browser.
   */
  private assertPortAllowed(port: string): void {
    if (ENV.obdAllowedPorts.length === 0) {
      throw new Error("No OBD ports are configured on this server (set OBD_ALLOWED_PORTS)");
    }
    if (!ENV.obdAllowedPorts.includes(port)) {
      throw new Error(`Port ${port} is not in the allowed list`);
    }
  }

  /** Look up a session and verify the socket's user owns it. */
  private requireOwnedSession(socket: AuthedSocket, sessionId: string): DiagnosticSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== socket.data.user.id) {
      throw new Error("Session not found");
    }
    return session;
  }

  /**
   * Wrap a handler so payload validation, ownership errors and unexpected
   * failures all reach the client the same way, and never as an unhandled
   * rejection that takes the process down.
   */
  private handle<T extends z.ZodTypeAny>(
    socket: AuthedSocket,
    event: string,
    schema: T,
    handler: (socket: AuthedSocket, input: z.infer<T>) => Promise<unknown>
  ): void {
    socket.on(event, async (payload: unknown, ack?: Ack) => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid payload";
        ack?.({ ok: false, error: message });
        socket.emit("error", { event, message });
        return;
      }

      try {
        const data = await handler(socket, parsed.data);
        ack?.({ ok: true, data });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[WebSocket] ${event} failed:`, message);
        ack?.({ ok: false, error: message });
        socket.emit("error", { event, message });
      }
    });
  }

  private setupHandlers(): void {
    this.io.on("connection", rawSocket => {
      const socket = rawSocket as AuthedSocket;
      console.log(`[WebSocket] Client connected: ${socket.id} (user ${socket.data.user.id})`);

      this.handle(socket, "diagnostic:start", startSchema, (s, input) =>
        this.handleDiagnosticStart(s, input)
      );
      this.handle(socket, "diagnostic:stop", sessionSchema, (s, input) =>
        this.handleDiagnosticStop(s, input.sessionId)
      );
      this.handle(socket, "parameter:request", parameterRequestSchema, (s, input) =>
        this.handleParameterRequest(s, input.sessionId, input.pid)
      );
      this.handle(socket, "errorcode:read", sessionSchema, (s, input) =>
        this.handleErrorCodeRead(s, input.sessionId)
      );
      this.handle(socket, "errorcode:clear", clearSchema, (s, input) =>
        this.handleErrorCodeClear(s, input.sessionId)
      );

      socket.on("disconnect", () => this.handleDisconnect(socket));
    });
  }

  private setupOBDListeners(): void {
    // Route each reading to the one session that owns the port it came from.
    obdManager.on("parameter", ({ port, parameter }: { port: string; parameter: OBDParameter }) => {
      const sessionId = this.portSessions.get(port);
      if (!sessionId) return;

      const session = this.sessions.get(sessionId);
      if (!session || !session.isActive) return;

      session.parameters.push(parameter);
      if (session.parameters.length > MAX_SESSION_PARAMETERS) {
        session.parameters.splice(0, session.parameters.length - MAX_SESSION_PARAMETERS);
      }

      this.io.to(this.room(sessionId)).emit("parameter:update", { sessionId, parameter });
    });

    obdManager.on("parameterError", ({ port, pid, error }: { port: string; pid: string; error: string }) => {
      const sessionId = this.portSessions.get(port);
      if (!sessionId) return;
      this.io.to(this.room(sessionId)).emit("parameter:error", { sessionId, pid, error });
    });

    // Connection-level events are addressed to the session on that port rather
    // than broadcast to everyone.
    obdManager.on("connected", ({ port }: { port: string }) => {
      const sessionId = this.portSessions.get(port);
      if (sessionId) this.io.to(this.room(sessionId)).emit("obd:connected", { sessionId, port });
    });
    obdManager.on("disconnected", ({ port }: { port: string }) => {
      const sessionId = this.portSessions.get(port);
      if (sessionId) this.io.to(this.room(sessionId)).emit("obd:disconnected", { sessionId, port });
    });
    obdManager.on("error", ({ port, error }: { port: string; error?: string }) => {
      const sessionId = this.portSessions.get(port);
      if (sessionId) this.io.to(this.room(sessionId)).emit("obd:error", { sessionId, port, error });
    });
  }

  private room(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private async handleDiagnosticStart(
    socket: AuthedSocket,
    input: z.infer<typeof startSchema>
  ): Promise<{ sessionId: string; port: string }> {
    const user = socket.data.user;

    this.assertPortAllowed(input.port);

    const vehicle = await db.getOwnedVehicle(user.id, input.vehicleId);
    if (!vehicle) throw new Error("Vehicle not found");

    if (input.diagnosticId !== undefined) {
      const diagnostic = await db.getOwnedDiagnostic(user.id, input.diagnosticId);
      if (!diagnostic) throw new Error("Diagnostic not found");
    }

    // One live session per port: two sessions polling the same adapter would
    // interleave commands on a device that answers one request at a time.
    const existing = this.portSessions.get(input.port);
    if (existing && this.sessions.get(existing)?.isActive) {
      throw new Error(`Port ${input.port} is already in use by another session`);
    }

    const sessionId = randomUUID();
    const session: DiagnosticSession = {
      id: sessionId,
      userId: user.id,
      vehicleId: input.vehicleId,
      diagnosticId: input.diagnosticId ?? null,
      port: input.port,
      isActive: true,
      startTime: new Date(),
      parameters: [],
      errorCodes: [],
    };

    this.sessions.set(sessionId, session);
    this.portSessions.set(input.port, sessionId);
    socket.data.sessionIds.add(sessionId);
    await socket.join(this.room(sessionId));

    if (!obdManager.getConnectionStatus(input.port)) {
      await obdManager.connectDevice(input.port);
    }
    obdManager.startScanning(input.port, input.intervalMs ?? 1000);

    socket.emit("diagnostic:started", { sessionId, port: input.port, vehicleId: input.vehicleId });
    console.log(`[WebSocket] Diagnostic started: ${sessionId} (user ${user.id})`);
    return { sessionId, port: input.port };
  }

  private async handleDiagnosticStop(socket: AuthedSocket, sessionId: string): Promise<void> {
    const session = this.requireOwnedSession(socket, sessionId);

    obdManager.stopScanning(session.port);
    session.isActive = false;

    this.io.to(this.room(sessionId)).emit("diagnostic:stopped", {
      sessionId,
      parameters: session.parameters,
      errorCodes: session.errorCodes,
    });

    this.disposeSession(sessionId);
    console.log(`[WebSocket] Diagnostic stopped: ${sessionId}`);
  }

  private async handleParameterRequest(
    socket: AuthedSocket,
    sessionId: string,
    pid: string
  ): Promise<OBDParameter> {
    const session = this.requireOwnedSession(socket, sessionId);
    if (!session.isActive) throw new Error("Session is not active");

    const parameter = await obdManager.requestParameter(session.port, pid);
    if (!parameter) throw new Error(`The vehicle does not report PID ${pid}`);

    session.parameters.push(parameter);
    if (session.parameters.length > MAX_SESSION_PARAMETERS) {
      session.parameters.splice(0, session.parameters.length - MAX_SESSION_PARAMETERS);
    }

    socket.emit("parameter:response", { sessionId, parameter });
    return parameter;
  }

  private async handleErrorCodeRead(socket: AuthedSocket, sessionId: string): Promise<OBDError[]> {
    const session = this.requireOwnedSession(socket, sessionId);

    const errorCodes = await obdManager.readErrorCodes(session.port);
    session.errorCodes = errorCodes;

    this.io.to(this.room(sessionId)).emit("errorcode:update", { sessionId, errorCodes });
    console.log(`[WebSocket] Error codes read: ${sessionId} (${errorCodes.length} found)`);
    return errorCodes;
  }

  private async handleErrorCodeClear(socket: AuthedSocket, sessionId: string): Promise<void> {
    const session = this.requireOwnedSession(socket, sessionId);

    const cleared = await obdManager.clearErrorCodes(session.port);
    if (!cleared) throw new Error("The vehicle did not acknowledge the clear command");

    session.errorCodes = [];
    this.io.to(this.room(sessionId)).emit("errorcode:cleared", { sessionId });
    console.log(`[WebSocket] Error codes cleared: ${sessionId} (user ${socket.data.user.id})`);
  }

  /** Drop a session and release the port it held. */
  private disposeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (this.portSessions.get(session.port) === sessionId) {
      this.portSessions.delete(session.port);
    }
    this.sessions.delete(sessionId);
  }

  private handleDisconnect(socket: AuthedSocket): void {
    // A socket may own several sessions; the old one-to-one map lost track of
    // every session after the first.
    for (const sessionId of socket.data.sessionIds ?? []) {
      const session = this.sessions.get(sessionId);
      if (!session) continue;

      const room = this.io.sockets.adapter.rooms.get(this.room(sessionId));
      const remaining = room ? room.size - 1 : 0;
      if (remaining > 0) continue; // another viewer is still attached

      obdManager.stopScanning(session.port);
      this.disposeSession(sessionId);
    }

    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  }

  getSession(sessionId: string): DiagnosticSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): DiagnosticSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      obdManager.stopScanning(session.port);
    }
    this.sessions.clear();
    this.portSessions.clear();
    await this.io.close();
  }
}

let handler: WebSocketHandler | null = null;

export function initializeWebSocket(httpServer: HTTPServer): WebSocketHandler {
  handler = new WebSocketHandler(httpServer);
  return handler;
}

export function getWebSocketHandler(): WebSocketHandler | null {
  return handler;
}
