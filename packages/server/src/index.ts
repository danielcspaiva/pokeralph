/**
 * @pokeralph/server
 *
 * HTTP server with REST API and WebSocket support for PokéRalph.
 * Uses Hono with Bun adapter.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { VERSION } from "@pokeralph/core";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", version: VERSION });
});

// API routes placeholder
app.get("/api", (c) => {
  return c.json({ message: "PokéRalph API v0.1.0" });
});

const port = Number(process.env.PORT) || 3456;

console.log(`PokéRalph server starting on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
