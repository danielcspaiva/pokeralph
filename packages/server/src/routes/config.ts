/**
 * Configuration routes for PokéRalph server
 *
 * Provides endpoints to read and update the project configuration.
 */

import { resolve } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { ConfigSchema } from "@pokeralph/core";
import { getOrchestrator, switchOrchestrator } from "../index.ts";
import { AppError } from "../middleware/error-handler.ts";

/**
 * Schema for validating working directory change requests
 */
const WorkingDirSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

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

  // ==========================================================================
  // Working Directory Endpoints
  // ==========================================================================

  /**
   * GET /api/config/working-dir
   *
   * Returns the current working directory.
   *
   * @returns {{ workingDir: string, hasPokeralphFolder: boolean }}
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/working-dir", async (c) => {
    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      throw new AppError(
        "Orchestrator not initialized. Server may still be starting.",
        503,
        "SERVICE_UNAVAILABLE"
      );
    }

    const workingDir = orchestrator.getWorkingDir();

    // Check if .pokeralph folder exists
    let hasPokeralphFolder = false;
    try {
      const pokeralphPath = `${workingDir}/.pokeralph`;
      const proc = Bun.spawnSync(["test", "-d", pokeralphPath]);
      hasPokeralphFolder = proc.exitCode === 0;
    } catch {
      // Ignore errors
    }

    return c.json({ workingDir, hasPokeralphFolder });
  });

  /**
   * POST /api/config/working-dir
   *
   * Changes the working directory to a new path.
   * This will cleanup the current orchestrator and create a new one.
   *
   * @param {{ path: string }} body - The new working directory path
   * @returns {{ success: boolean, workingDir: string }}
   * @throws {400} If path is invalid or doesn't exist
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/working-dir", async (c) => {
    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("Invalid JSON body", 400, "INVALID_JSON");
    }

    const parseResult = WorkingDirSchema.safeParse(body);
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

    // Resolve to absolute path
    const newPath = resolve(parseResult.data.path);

    // Validate that the path exists and is a directory
    try {
      const proc = Bun.spawnSync(["test", "-d", newPath]);
      if (proc.exitCode !== 0) {
        throw new AppError(
          `Path is not a directory: ${newPath}`,
          400,
          "INVALID_PATH"
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        `Cannot access path: ${newPath}`,
        400,
        "INVALID_PATH"
      );
    }

    // Check if a battle is currently running
    const currentOrchestrator = getOrchestrator();
    if (currentOrchestrator?.isBattleRunning()) {
      throw new AppError(
        "Cannot switch repository while a battle is running. Cancel the battle first.",
        400,
        "BATTLE_IN_PROGRESS"
      );
    }

    try {
      // Switch to new working directory
      await switchOrchestrator(newPath);

      return c.json({
        success: true,
        workingDir: newPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch repository";
      throw new AppError(message, 500, "SWITCH_FAILED");
    }
  });

  return router;
}
