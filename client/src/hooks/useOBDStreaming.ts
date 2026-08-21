import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * Live OBD data over Socket.io.
 *
 * The connection is authenticated by the same session cookie as the HTTP API,
 * so no token handling is needed here — but the cookie must be sent, which is
 * why `withCredentials` is set.
 */

export interface OBDParameter {
  pid: string;
  name: string;
  value: number;
  unit: string;
  isNormal: boolean;
  timestamp: string;
  isSimulated: boolean;
}

export interface OBDError {
  code: string;
  description: string;
  severity: "info" | "warning" | "error" | "critical";
  system: string;
}

export interface DiagnosticSession {
  id: string;
  vehicleId: number;
  port: string;
  isActive: boolean;
}

/**
 * Readings kept in component state.
 *
 * A live scan produces about five readings per second, so an unbounded array
 * grows without limit for a view that only ever shows a short tail.
 */
const MAX_PARAMETERS = 300;

type AckResult = { ok: true; data?: unknown } | { ok: false; error: string };

export function useOBDStreaming() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeSession, setActiveSession] = useState<DiagnosticSession | null>(null);
  const [parameters, setParameters] = useState<OBDParameter[]>([]);
  const [errorCodes, setErrorCodes] = useState<OBDError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      setError(null);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      // The server drops the session when the last socket for it goes away, so
      // a stale "active" session here would offer controls that no longer work.
      setActiveSession(null);
    });

    socket.on("connect_error", (err: Error) => {
      setIsConnected(false);
      setError(
        err.message === "Unauthorized"
          ? "Nicht angemeldet — bitte neu einloggen."
          : `Verbindung fehlgeschlagen: ${err.message}`
      );
    });

    socket.on("error", (data: { event?: string; message?: string }) => {
      setError(data.message ?? "Unbekannter Fehler");
    });

    socket.on("parameter:update", (data: { parameter: OBDParameter }) => {
      setParameters(prev => {
        const next = [...prev, data.parameter];
        return next.length > MAX_PARAMETERS ? next.slice(-MAX_PARAMETERS) : next;
      });
    });

    socket.on("parameter:response", (data: { parameter: OBDParameter }) => {
      setParameters(prev => {
        const next = [...prev, data.parameter];
        return next.length > MAX_PARAMETERS ? next.slice(-MAX_PARAMETERS) : next;
      });
    });

    socket.on("parameter:error", (data: { pid: string; error: string }) => {
      setError(`PID ${data.pid}: ${data.error}`);
    });

    socket.on("errorcode:update", (data: { errorCodes: OBDError[] }) => {
      setErrorCodes(data.errorCodes);
    });

    socket.on("errorcode:cleared", () => {
      setErrorCodes([]);
    });

    socket.on("diagnostic:started", (data: { sessionId: string; port: string; vehicleId: number }) => {
      setActiveSession({
        id: data.sessionId,
        vehicleId: data.vehicleId,
        port: data.port,
        isActive: true,
      });
      setParameters([]);
      setErrorCodes([]);
    });

    socket.on("diagnostic:stopped", () => {
      setActiveSession(prev => (prev ? { ...prev, isActive: false } : null));
    });

    socketRef.current = socket;

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  /**
   * Emit and wait for the server's acknowledgement.
   *
   * Every handler answers with an ack, so a failure surfaces at the call site
   * instead of only as a stray `error` event with no link to what caused it.
   */
  const emit = useCallback((event: string, payload: Record<string, unknown>): Promise<AckResult> => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return Promise.resolve({ ok: false, error: "Keine Verbindung zum Server" });
    }

    return new Promise<AckResult>(resolve => {
      const timeout = setTimeout(
        () => resolve({ ok: false, error: "Zeitüberschreitung — der Server hat nicht geantwortet" }),
        15_000
      );
      socket.emit(event, payload, (result: AckResult) => {
        clearTimeout(timeout);
        resolve(result ?? { ok: false, error: "Leere Antwort vom Server" });
      });
    });
  }, []);

  const run = useCallback(
    async (event: string, payload: Record<string, unknown>) => {
      setIsBusy(true);
      setError(null);
      try {
        const result = await emit(event, payload);
        if (!result.ok) setError(result.error);
        return result.ok;
      } finally {
        setIsBusy(false);
      }
    },
    [emit]
  );

  const startDiagnostic = useCallback(
    (vehicleId: number, port: string, diagnosticId?: number) =>
      run("diagnostic:start", { vehicleId, port, diagnosticId }),
    [run]
  );

  const stopDiagnostic = useCallback(async () => {
    if (!activeSession) return false;
    const ok = await run("diagnostic:stop", { sessionId: activeSession.id });
    if (ok) setActiveSession(null);
    return ok;
  }, [activeSession, run]);

  const requestParameter = useCallback(
    (pid: string) => {
      if (!activeSession) return Promise.resolve(false);
      return run("parameter:request", { sessionId: activeSession.id, pid });
    },
    [activeSession, run]
  );

  const readErrorCodes = useCallback(() => {
    if (!activeSession) return Promise.resolve(false);
    return run("errorcode:read", { sessionId: activeSession.id });
  }, [activeSession, run]);

  /**
   * Erase stored trouble codes on the vehicle.
   *
   * The server requires `confirm: true`, so this cannot be triggered by a
   * malformed or replayed payload. The caller is responsible for asking the
   * user first — the operation is irreversible.
   */
  const clearErrorCodes = useCallback(() => {
    if (!activeSession) return Promise.resolve(false);
    return run("errorcode:clear", { sessionId: activeSession.id, confirm: true });
  }, [activeSession, run]);

  return {
    isConnected,
    isBusy,
    activeSession,
    parameters,
    errorCodes,
    error,
    clearError: useCallback(() => setError(null), []),
    startDiagnostic,
    stopDiagnostic,
    requestParameter,
    readErrorCodes,
    clearErrorCodes,
  };
}
