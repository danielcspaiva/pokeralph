/**
 * Routes index
 *
 * Groups all API routes for the PokéRalph server.
 */

import { Hono } from "hono";
import { VERSION } from "@pokeralph/core";
import { createConfigRoutes } from "./config.ts";
import { createPRDRoutes } from "./prd.ts";

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
        tasks: "GET/POST /api/prd/tasks, GET/PUT/DELETE /api/prd/tasks/:id",
        planning: "POST /api/planning/start, /answer, /finish",
        battle: "POST /api/battle/start/:taskId, /pause, /resume, /cancel, /approve",
      },
    });
  });

  // Config routes (Task 013)
  const configRoutes = createConfigRoutes();
  api.route("/config", configRoutes);

  // PRD and Tasks routes (Task 014)
  const prdRoutes = createPRDRoutes();
  api.route("/prd", prdRoutes);

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
