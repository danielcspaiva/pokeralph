/**
 * @pokeralph/server
 *
 * HTTP server with REST API and WebSocket support for PokéRalph.
 * Uses Hono with Bun adapter.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { VERSION, Orchestrator } from "@pokeralph/core";
import { createRoutes } from "./routes/index.ts";
import { globalErrorHandler, notFoundHandler } from "./middleware/index.ts";
import {
  createWebSocketHandlers,
  getWebSocketManager,
  resetWebSocketManager,
  type WebSocketData,
} from "./websocket/index.ts";

/**
 * Server configuration
 */
export interface ServerConfig {
  port: number;
  workingDir: string;
}

/**
 * Server state and instance references
 */
export interface ServerState {
  orchestrator: Orchestrator | null;
  server: ReturnType<typeof Bun.serve> | null;
  isShuttingDown: boolean;
}

// Global state
const state: ServerState = {
  orchestrator: null,
  server: null,
  isShuttingDown: false,
};

/**
 * Creates and configures the Hono app
 */
export function createApp(): Hono {
  const app = new Hono();

  // Global error handler - catches all thrown errors
  app.onError(globalErrorHandler);

  // Logging middleware
  app.use("*", logger());

  // CORS - allow localhost for development
  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173", "http://localhost:3000"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    })
  );

  // Health check endpoint
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      version: VERSION,
      timestamp: new Date().toISOString(),
      orchestratorInitialized: state.orchestrator !== null,
    });
  });

  // Mount API routes under /api
  const apiRoutes = createRoutes();
  app.route("/api", apiRoutes);

  // Not found handler for unmatched routes
  app.notFound(notFoundHandler);

  return app;
}

/**
 * Initializes the Orchestrator from @pokeralph/core
 */
export function initializeOrchestrator(workingDir: string): Orchestrator {
  console.log(`[Server] Initializing Orchestrator with workingDir: ${workingDir}`);
  const orchestrator = Orchestrator.create(workingDir);
  state.orchestrator = orchestrator;
  return orchestrator;
}

/**
 * Returns the current Orchestrator instance
 */
export function getOrchestrator(): Orchestrator | null {
  return state.orchestrator;
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  if (state.isShuttingDown) {
    console.log("[Server] Shutdown already in progress...");
    return;
  }

  state.isShuttingDown = true;
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  // Close WebSocket connections
  console.log("[Server] Closing WebSocket connections...");
  const wsManager = getWebSocketManager();
  wsManager.close();

  // Stop accepting new connections
  if (state.server) {
    console.log("[Server] Stopping server...");
    state.server.stop();
    state.server = null;
  }

  // Clean up orchestrator if needed
  if (state.orchestrator) {
    console.log("[Server] Cleaning up orchestrator...");
    // Future: Add cleanup logic if BattleOrchestrator has running battles
    state.orchestrator = null;
  }

  console.log("[Server] Shutdown complete.");
  process.exit(0);
}

/**
 * Starts the server with WebSocket support
 */
export function startServer(config: Partial<ServerConfig> = {}): ReturnType<typeof Bun.serve> {
  const port = config.port ?? (Number(process.env.PORT) || 3456);
  const workingDir = config.workingDir ?? process.cwd();

  // Initialize orchestrator
  const orchestrator = initializeOrchestrator(workingDir);

  // Set up WebSocket manager with orchestrator events
  const wsManager = getWebSocketManager();
  wsManager.setupOrchestrator(orchestrator);

  // Create app
  const app = createApp();

  // Get WebSocket handlers
  const wsHandlers = createWebSocketHandlers();

  // Register shutdown handlers
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start server with WebSocket support
  console.log(`[Server] PokéRalph v${VERSION} starting...`);
  console.log(`[Server] Working directory: ${workingDir}`);
  console.log(`[Server] Listening on http://localhost:${port}`);
  console.log(`[Server] WebSocket available at ws://localhost:${port}/ws`);

  const server = Bun.serve<WebSocketData>({
    port,
    fetch(req, server) {
      // Check if this is a WebSocket upgrade request
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        // Upgrade to WebSocket
        const upgraded = server.upgrade(req, {
          data: {
            id: "",
            lastPing: Date.now(),
            isAlive: true,
          },
        });
        if (upgraded) {
          return undefined;
        }
        // Upgrade failed
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Handle HTTP requests via Hono
      return app.fetch(req);
    },
    websocket: wsHandlers,
  });

  state.server = server;
  return server;
}

/**
 * Returns the current server state (for testing)
 */
export function getServerState(): Readonly<ServerState> {
  return { ...state };
}

/**
 * Resets server state (for testing)
 */
export function resetServerState(): void {
  resetWebSocketManager();
  state.orchestrator = null;
  state.server = null;
  state.isShuttingDown = false;
}

// Create app for testing (does not start server)
const app = createApp();

// Default export for Bun.serve compatibility and testing
export default {
  port: Number(process.env.PORT) || 3456,
  fetch: app.fetch,
};

// Start server if this file is run directly
if (import.meta.main) {
  startServer();
}
