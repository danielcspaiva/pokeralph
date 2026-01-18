/**
 * Onboarding routes for PokéRalph server
 *
 * Provides endpoints for project detection and onboarding flow.
 * Implements 09-onboarding.md specification.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  detectProject,
  getSuggestedConfig,
  ConfigSchema,
} from "@pokeralph/core";
import { getOrchestrator } from "../index.ts";
import { AppError } from "../middleware/error-handler.ts";

/**
 * Schema for validating complete onboarding requests
 */
const CompleteOnboardingSchema = z.object({
  config: ConfigSchema,
  skipFirstPRD: z.boolean(),
});

/**
 * Creates the onboarding router with detection and completion endpoints
 */
export function createOnboardingRoutes(): Hono {
  const router = new Hono();

  // ==========================================================================
  // Detection Endpoint
  // ==========================================================================

  /**
   * POST /api/onboarding/detect
   *
   * Detect project type and suggest configuration.
   * Detects package manager, framework, test runner, linter, and TypeScript usage.
   * Also checks for bun.lock (text) in addition to bun.lockb (binary).
   *
   * @returns {{ detection: ProjectDetection, suggestedConfig: Config }}
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/detect", async (c) => {
    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      throw new AppError(
        "Orchestrator not initialized. Server may still be starting.",
        503,
        "SERVICE_UNAVAILABLE"
      );
    }

    const workingDir = orchestrator.getWorkingDir();

    try {
      const detection = await detectProject(workingDir);
      const suggestedConfig = getSuggestedConfig(detection);

      return c.json({
        detection,
        suggestedConfig,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to detect project type";
      throw new AppError(message, 500, "DETECTION_FAILED");
    }
  });

  // ==========================================================================
  // Complete Onboarding Endpoint
  // ==========================================================================

  /**
   * POST /api/onboarding/complete
   *
   * Mark onboarding as complete and save configuration.
   *
   * @param {{ config: Config, skipFirstPRD: boolean }} body
   * @returns {{ success: boolean, configPath: string }}
   * @throws {400} If validation fails
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/complete", async (c) => {
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

    const parseResult = CompleteOnboardingSchema.safeParse(body);
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

    const { config } = parseResult.data;
    const workingDir = orchestrator.getWorkingDir();

    try {
      // Save the configuration
      await orchestrator.updateConfig(config);

      return c.json({
        success: true,
        configPath: `${workingDir}/.pokeralph/config.json`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding";
      throw new AppError(message, 500, "COMPLETE_FAILED");
    }
  });

  // ==========================================================================
  // Status Endpoint
  // ==========================================================================

  /**
   * GET /api/onboarding/status
   *
   * Check onboarding status - whether config and PRD exist.
   *
   * @returns {{ completed: boolean, existingConfig: boolean, existingPRD: boolean }}
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/status", async (c) => {
    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      throw new AppError(
        "Orchestrator not initialized. Server may still be starting.",
        503,
        "SERVICE_UNAVAILABLE"
      );
    }

    try {
      let existingConfig = false;
      let existingPRD = false;

      // Check if config exists (getConfig throws if not found)
      try {
        await orchestrator.getConfig();
        existingConfig = true;
      } catch {
        existingConfig = false;
      }

      // Check if PRD exists (getPRD returns null if not found, doesn't throw)
      try {
        const prd = await orchestrator.getPRD();
        existingPRD = prd !== null;
      } catch {
        existingPRD = false;
      }

      // Onboarding is considered complete if config exists
      const completed = existingConfig;

      return c.json({
        completed,
        existingConfig,
        existingPRD,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to check onboarding status";
      throw new AppError(message, 500, "STATUS_CHECK_FAILED");
    }
  });

  return router;
}
