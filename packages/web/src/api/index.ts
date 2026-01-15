/**
 * API module for PokéRalph web client
 *
 * Provides both REST API client and WebSocket client for server communication.
 *
 * @example
 * ```ts
 * import { api, ws } from "@/api";
 *
 * // REST API calls
 * const config = await api.getConfig();
 * const tasks = await api.getTasks();
 *
 * // WebSocket events
 * ws.connect();
 * ws.on("progress_update", (payload) => {
 *   console.log(payload.progress);
 * });
 * ```
 */

// Re-export all REST API functions and types
export * from "./client.ts";

// Re-export all WebSocket functions and types
export * from "./websocket.ts";

// Named exports for convenient imports
import * as api from "./client.ts";
import * as ws from "./websocket.ts";

export { api, ws };
