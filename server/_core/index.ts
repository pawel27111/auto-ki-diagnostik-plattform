import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { createServer, type Server } from "node:http";
import net from "node:net";
import { appRouter } from "../routers";
import { initializeLLMService } from "../llm/llmService";
import { obdManager } from "../obd/obdManager";
import { initializeWebSocket } from "../obd/websocketHandler";
import { createContext } from "./context";
import { requireSameOrigin } from "./csrf";
import { assertRequiredEnv, ENV } from "./env";
import { registerOAuthRoutes } from "./oauth";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Close ports and sockets before exiting.
 *
 * Serial ports stay claimed by the OS until the handle is released, so an
 * abrupt exit leaves the OBD adapter unusable until it is replugged.
 */
function registerShutdownHandlers(server: Server, closeWebSocket: () => Promise<void>) {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] ${signal} received, shutting down`);

    const timeout = setTimeout(() => {
      console.warn("[Server] Shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);
    timeout.unref();

    try {
      await closeWebSocket();
      await obdManager.disconnectAll();
      await new Promise<void>(resolve => server.close(() => resolve()));
      clearTimeout(timeout);
      process.exit(0);
    } catch (error) {
      console.error("[Server] Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

async function startServer() {
  // Fail fast on missing configuration rather than at the first login attempt.
  assertRequiredEnv();

  const app = express();
  const server = createServer(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // tRPC API. requireSameOrigin runs first: the session cookie is SameSite=None
  // in production, so the origin check is what stops cross-site mutations.
  app.use(
    "/api/trpc",
    requireSameOrigin,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  initializeLLMService({
    provider: ENV.llm.provider,
    timeoutMs: 30_000,
    openrouter: ENV.llm.openRouterApiKey
      ? { apiKey: ENV.llm.openRouterApiKey, model: ENV.llm.openRouterModel || undefined }
      : undefined,
    lmstudio: ENV.llm.lmStudioBaseUrl
      ? { baseUrl: ENV.llm.lmStudioBaseUrl, model: ENV.llm.lmStudioModel || undefined }
      : undefined,
  });

  // Real-time OBD streaming. Must be attached before the Vite/static catch-all
  // so the upgrade request is not swallowed by the SPA fallback.
  const wsHandler = initializeWebSocket(server);
  console.log(
    ENV.obdAllowedPorts.length > 0
      ? `[Server] OBD streaming enabled for ports: ${ENV.obdAllowedPorts.join(", ")}`
      : "[Server] OBD streaming enabled, but no ports are allowed (set OBD_ALLOWED_PORTS)"
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  registerShutdownHandlers(server, () => wsHandler.close());

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(error => {
  console.error("[Server] Failed to start:", error);
  process.exit(1);
});
