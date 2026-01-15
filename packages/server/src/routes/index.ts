/**
 * Routes index
 *
 * Groups all API routes for the PokéRalph server.
 */

import { Hono } from "hono";
import { VERSION } from "@pokeralph/core";

/**
 * Creates the main API router with all routes grouped.
 */
export function createRoutes(): Hono {
  const api = new Hono();

  // Root API info
  api.get("/", (c) => {
    return c.json({
      name: "PokéRalph API",
      version: VERSION,
      endpoints: {
        health: "GET /health",
        config: "GET/PUT /api/config",
        prd: "GET/PUT /api/prd",
        tasks: "GET/POST /api/tasks, GET/PUT/DELETE /api/tasks/:id",
        planning: "POST /api/planning/start, /answer, /finish",
        battle: "POST /api/battle/start/:taskId, /pause, /resume, /cancel, /approve",
      },
    });
  });

  // Placeholder routes - will be implemented in Tasks 013-016
  // Config routes (Task 013)
  api.get("/config", (c) => {
    return c.json({ message: "Config endpoint - not yet implemented" }, 501);
  });

  api.put("/config", (c) => {
    return c.json({ message: "Config endpoint - not yet implemented" }, 501);
  });

  // PRD routes (Task 014)
  api.get("/prd", (c) => {
    return c.json({ message: "PRD endpoint - not yet implemented" }, 501);
  });

  // Tasks routes (Task 014)
  api.get("/tasks", (c) => {
    return c.json({ message: "Tasks endpoint - not yet implemented" }, 501);
  });

  api.get("/tasks/:id", (c) => {
    return c.json({ message: "Tasks endpoint - not yet implemented" }, 501);
  });

  // Planning routes (Task 015)
  api.post("/planning/start", (c) => {
    return c.json({ message: "Planning endpoint - not yet implemented" }, 501);
  });

  // Battle routes (Task 016)
  api.post("/battle/start/:taskId", (c) => {
    return c.json({ message: "Battle endpoint - not yet implemented" }, 501);
  });

  return api;
}
