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
import { errorHandler, notFoundHandler } from "./middleware/index.ts";

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

  // Error handling middleware (must be first)
  app.use("*", errorHandler);

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
 * Starts the server
 */
export function startServer(config: Partial<ServerConfig> = {}): ReturnType<typeof Bun.serve> {
  const port = config.port ?? (Number(process.env.PORT) || 3456);
  const workingDir = config.workingDir ?? process.cwd();

  // Initialize orchestrator
  initializeOrchestrator(workingDir);

  // Create app
  const app = createApp();

  // Register shutdown handlers
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start server
  console.log(`[Server] PokéRalph v${VERSION} starting...`);
  console.log(`[Server] Working directory: ${workingDir}`);
  console.log(`[Server] Listening on http://localhost:${port}`);

  const server = Bun.serve({
    port,
    fetch: app.fetch,
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
