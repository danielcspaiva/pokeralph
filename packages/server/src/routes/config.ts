/**
 * Configuration routes for PokéRalph server
 *
 * Provides endpoints to read and update the project configuration.
 */

import { Hono } from "hono";
import { ConfigSchema } from "@pokeralph/core";
import { getOrchestrator } from "../index.ts";
import { AppError } from "../middleware/error-handler.ts";

/**
 * Schema for validating partial config updates
 */
const PartialConfigSchema = ConfigSchema.partial();

/**
 * Creates the config router with GET and PUT endpoints
 */
export function createConfigRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /api/config
   *
   * Returns the current configuration.
   *
   * @returns {Config} The current project configuration
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/", async (c) => {
    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      throw new AppError(
        "Orchestrator not initialized. Server may still be starting.",
        503,
        "SERVICE_UNAVAILABLE"
      );
    }

    try {
      const config = await orchestrator.getConfig();
      return c.json(config);
    } catch (error) {
      // Config file doesn't exist - initialize first
      if (error instanceof Error && error.message.includes("not found")) {
        throw new AppError(
          "Configuration not found. Initialize the project first.",
          404,
          "CONFIG_NOT_FOUND"
        );
      }
      throw error;
    }
  });

  /**
   * PUT /api/config
   *
   * Updates the configuration with partial values.
   * Validates all provided fields against the Config schema.
   *
   * @param {Partial<Config>} body - Partial config to merge
   * @returns {Config} The updated configuration
   * @throws {400} If validation fails
   * @throws {503} If orchestrator is not initialized
   */
  router.put("/", async (c) => {
    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      throw new AppError(
        "Orchestrator not initialized. Server may still be starting.",
        503,
        "SERVICE_UNAVAILABLE"
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("Invalid JSON body", 400, "INVALID_JSON");
    }

    // Validate against partial schema
    const parseResult = PartialConfigSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }));
      throw new AppError(
        `Validation failed: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    // Check if any fields were provided
    const partialConfig = parseResult.data;
    if (Object.keys(partialConfig).length === 0) {
      throw new AppError(
        "No configuration fields provided",
        400,
        "EMPTY_UPDATE"
      );
    }

    try {
      // Update config
      await orchestrator.updateConfig(partialConfig);

      // Return the updated config
      const updatedConfig = await orchestrator.getConfig();
      return c.json(updatedConfig);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw new AppError(
          "Configuration not found. Initialize the project first.",
          404,
          "CONFIG_NOT_FOUND"
        );
      }
      throw error;
    }
  });

  return router;
}
