import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

export interface OBDParameter {
  pid: string;
  name: string;
  value: number | string;
  unit: string;
  timestamp: Date;
}

export interface OBDError {
  code: string;
  description: string;
  severity: "info" | "warning" | "error" | "critical";
}

export interface DiagnosticSession {
  id: string;
  vehicleId: number;
  port: string;
  isActive: boolean;
  parameters: OBDParameter[];
  errorCodes: OBDError[];
}

export function useOBDStreaming() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeSession, setActiveSession] = useState<DiagnosticSession | null>(null);
  const [parameters, setParameters] = useState<OBDParameter[]>([]);
  const [errorCodes, setErrorCodes] = useState<OBDError[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const socket = io(window.location.origin, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      console.log("[OBD] Connected to server");
      setIsConnected(true);
      setError(null);
    });

    socket.on("disconnect", () => {
      console.log("[OBD] Disconnected from server");
      setIsConnected(false);
    });

    socket.on("error", (data: any) => {
      console.error("[OBD] Error:", data);
      setError(data.message || "Unknown error");
    });

    // Handle parameter updates
    socket.on("parameter:update", (data: any) => {
      setParameters((prev) => [...prev, data.parameter]);
    });

    // Handle error code updates
    socket.on("errorcode:update", (data: any) => {
      setErrorCodes(data.errorCodes);
    });

    // Handle diagnostic started
    socket.on("diagnostic:started", (data: any) => {
      console.log("[OBD] Diagnostic started:", data.sessionId);
      setActiveSession({
        id: data.sessionId,
        vehicleId: 0,
        port: data.port,
        isActive: true,
        parameters: [],
        errorCodes: [],
      });
      setParameters([]);
      setErrorCodes([]);
    });

    // Handle diagnostic stopped
    socket.on("diagnostic:stopped", (data: any) => {
      console.log("[OBD] Diagnostic stopped");
      setActiveSession((prev) =>
        prev ? { ...prev, isActive: false } : null
      );
    });

    // Handle OBD connection status
    socket.on("obd:connected", (data: any) => {
      console.log("[OBD] Device connected:", data.port);
    });

    socket.on("obd:disconnected", (data: any) => {
      console.log("[OBD] Device disconnected:", data.port);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  // Start diagnostic session
  const startDiagnostic = useCallback(
    (vehicleId: number, port: string) => {
      if (!socketRef.current) return;

      const sessionId = `session-${Date.now()}`;
      socketRef.current.emit("diagnostic:start", {
        sessionId,
        vehicleId,
        port,
      });
    },
    []
  );

  // Stop diagnostic session
  const stopDiagnostic = useCallback(() => {
    if (!socketRef.current || !activeSession) return;

    socketRef.current.emit("diagnostic:stop", {
      sessionId: activeSession.id,
    });
  }, [activeSession]);

  // Request specific parameter
  const requestParameter = useCallback(
    (pid: string, name: string, unit: string) => {
      if (!socketRef.current || !activeSession) return;

      socketRef.current.emit("parameter:request", {
        sessionId: activeSession.id,
        pid,
        name,
        unit,
      });
    },
    [activeSession]
  );

  // Read error codes
  const readErrorCodes = useCallback(() => {
    if (!socketRef.current || !activeSession) return;

    socketRef.current.emit("errorcode:read", {
      sessionId: activeSession.id,
    });
  }, [activeSession]);

  // Clear error codes
  const clearErrorCodes = useCallback(() => {
    if (!socketRef.current || !activeSession) return;

    socketRef.current.emit("errorcode:clear", {
      sessionId: activeSession.id,
    });
  }, [activeSession]);

  return {
    isConnected,
    activeSession,
    parameters,
    errorCodes,
    error,
    startDiagnostic,
    stopDiagnostic,
    requestParameter,
    readErrorCodes,
    clearErrorCodes,
  };
}
