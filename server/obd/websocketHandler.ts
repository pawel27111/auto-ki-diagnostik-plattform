import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { obdManager, OBDParameter, OBDError } from "./obdManager";

/**
 * WebSocket Handler for real-time OBD data streaming
 * Manages Socket.io connections and broadcasts OBD data to connected clients
 */

export interface DiagnosticSession {
  id: string;
  vehicleId: number;
  port: string;
  isActive: boolean;
  startTime: Date;
  parameters: OBDParameter[];
  errorCodes: OBDError[];
  clients: Set<string>; // Socket IDs
}

export class WebSocketHandler {
  private io: SocketIOServer;
  private sessions: Map<string, DiagnosticSession> = new Map();
  private clientSessions: Map<string, string> = new Map(); // Socket ID -> Session ID

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.setupHandlers();
    this.setupOBDListeners();
  }

  /**
   * Setup Socket.io event handlers
   */
  private setupHandlers(): void {
    this.io.on("connection", (socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      // Handle diagnostic start
      socket.on("diagnostic:start", (data) => {
        this.handleDiagnosticStart(socket, data);
      });

      // Handle diagnostic stop
      socket.on("diagnostic:stop", (data) => {
        this.handleDiagnosticStop(socket, data);
      });

      // Handle parameter request
      socket.on("parameter:request", (data) => {
        this.handleParameterRequest(socket, data);
      });

      // Handle error code read
      socket.on("errorcode:read", (data) => {
        this.handleErrorCodeRead(socket, data);
      });

      // Handle error code clear
      socket.on("errorcode:clear", (data) => {
        this.handleErrorCodeClear(socket, data);
      });

      // Handle disconnect
      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Setup OBD Manager event listeners
   */
  private setupOBDListeners(): void {
    // Listen for OBD parameter updates
    obdManager.on("parameter", (parameter: OBDParameter) => {
      // Broadcast to all clients in active sessions
      this.sessions.forEach((session, sessionId) => {
        if (session.isActive) {
          session.parameters.push(parameter);

          // Broadcast to all clients in this session
          session.clients.forEach((clientId) => {
            this.io.to(clientId).emit("parameter:update", {
              sessionId,
              parameter,
            });
          });
        }
      });
    });

    // Listen for OBD connection events
    obdManager.on("connected", (data) => {
      this.io.emit("obd:connected", data);
    });

    obdManager.on("disconnected", (data) => {
      this.io.emit("obd:disconnected", data);
    });

    // Listen for OBD errors
    obdManager.on("error", (data) => {
      this.io.emit("obd:error", data);
    });
  }

  /**
   * Handle diagnostic start
   */
  private async handleDiagnosticStart(
    socket: any,
    data: { sessionId: string; vehicleId: number; port: string }
  ): Promise<void> {
    try {
      const { sessionId, vehicleId, port } = data;

      // Create new session
      const session: DiagnosticSession = {
        id: sessionId,
        vehicleId,
        port,
        isActive: true,
        startTime: new Date(),
        parameters: [],
        errorCodes: [],
        clients: new Set([socket.id]),
      };

      this.sessions.set(sessionId, session);
      this.clientSessions.set(socket.id, sessionId);

      // Join socket to session room
      socket.join(`session:${sessionId}`);

      // Start OBD scanning
      obdManager.startScanning(port, 1000);

      // Emit success
      socket.emit("diagnostic:started", { sessionId, port });
      console.log(`[WebSocket] Diagnostic started: ${sessionId}`);
    } catch (error) {
      socket.emit("error", { message: String(error) });
      console.error("[WebSocket] Error starting diagnostic:", error);
    }
  }

  /**
   * Handle diagnostic stop
   */
  private async handleDiagnosticStop(
    socket: any,
    data: { sessionId: string }
  ): Promise<void> {
    try {
      const { sessionId } = data;
      const session = this.sessions.get(sessionId);

      if (!session) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      // Stop OBD scanning
      obdManager.stopScanning(session.port);

      // Mark session as inactive
      session.isActive = false;

      // Emit stop event to all clients in session
      this.io.to(`session:${sessionId}`).emit("diagnostic:stopped", {
        sessionId,
        parameters: session.parameters,
        errorCodes: session.errorCodes,
      });

      console.log(`[WebSocket] Diagnostic stopped: ${sessionId}`);
    } catch (error) {
      socket.emit("error", { message: String(error) });
      console.error("[WebSocket] Error stopping diagnostic:", error);
    }
  }

  /**
   * Handle parameter request
   */
  private async handleParameterRequest(
    socket: any,
    data: { sessionId: string; pid: string; name: string; unit: string }
  ): Promise<void> {
    try {
      const { sessionId, pid, name, unit } = data;
      const session = this.sessions.get(sessionId);

      if (!session || !session.isActive) {
        socket.emit("error", { message: "Session not active" });
        return;
      }

      // Request parameter from OBD device
      const parameter = await obdManager.requestParameter(
        session.port,
        pid,
        name,
        unit
      );

      if (parameter) {
        session.parameters.push(parameter);

        // Emit to requesting client
        socket.emit("parameter:response", {
          sessionId,
          parameter,
        });
      } else {
        socket.emit("error", { message: "Failed to read parameter" });
      }
    } catch (error) {
      socket.emit("error", { message: String(error) });
      console.error("[WebSocket] Error requesting parameter:", error);
    }
  }

  /**
   * Handle error code read
   */
  private async handleErrorCodeRead(
    socket: any,
    data: { sessionId: string }
  ): Promise<void> {
    try {
      const { sessionId } = data;
      const session = this.sessions.get(sessionId);

      if (!session) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      // Read error codes from OBD device
      const errorCodes = await obdManager.readErrorCodes(session.port);
      session.errorCodes = errorCodes;

      // Emit to all clients in session
      this.io.to(`session:${sessionId}`).emit("errorcode:update", {
        sessionId,
        errorCodes,
      });

      console.log(`[WebSocket] Error codes read: ${sessionId}`);
    } catch (error) {
      socket.emit("error", { message: String(error) });
      console.error("[WebSocket] Error reading error codes:", error);
    }
  }

  /**
   * Handle error code clear
   */
  private async handleErrorCodeClear(
    socket: any,
    data: { sessionId: string }
  ): Promise<void> {
    try {
      const { sessionId } = data;
      const session = this.sessions.get(sessionId);

      if (!session) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      // Clear error codes
      const success = await obdManager.clearErrorCodes(session.port);

      if (success) {
        session.errorCodes = [];

        // Emit to all clients in session
        this.io.to(`session:${sessionId}`).emit("errorcode:cleared", {
          sessionId,
        });

        console.log(`[WebSocket] Error codes cleared: ${sessionId}`);
      } else {
        socket.emit("error", { message: "Failed to clear error codes" });
      }
    } catch (error) {
      socket.emit("error", { message: String(error) });
      console.error("[WebSocket] Error clearing error codes:", error);
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socket: any): void {
    const sessionId = this.clientSessions.get(socket.id);

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.clients.delete(socket.id);

        // If no more clients in session, stop scanning
        if (session.clients.size === 0) {
          obdManager.stopScanning(session.port);
          this.sessions.delete(sessionId);
        }
      }

      this.clientSessions.delete(socket.id);
    }

    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): DiagnosticSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): DiagnosticSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }

  /**
   * Broadcast message to session
   */
  broadcastToSession(sessionId: string, event: string, data: any): void {
    this.io.to(`session:${sessionId}`).emit(event, data);
  }
}

export let wsHandler: WebSocketHandler;

export function initializeWebSocket(httpServer: HTTPServer): WebSocketHandler {
  wsHandler = new WebSocketHandler(httpServer);
  return wsHandler;
}
