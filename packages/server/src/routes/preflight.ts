/**
 * Preflight routes for PokéRalph server
 *
 * Provides endpoints for running pre-battle validation checks.
 * Based on: SPECS/10-preflight.md
 */

import { Hono } from "hono";
import { z } from "zod";
import { getOrchestrator } from "../index.ts";
import { AppError } from "../middleware/error-handler.ts";
import {
  PreflightService,
  toPreflightReportDTO,
  toPreflightCheckResultDTO,
  validatePreflightToken,
  DryRunService,
  type PreflightContext,
  type DryRunContext,
} from "@pokeralph/core";

/**
 * Schema for running preflight
 */
const PreflightRequestSchema = z.object({
  taskId: z.string().min(1),
});

/**
 * Schema for applying a fix
 */
const PreflightFixRequestSchema = z.object({
  taskId: z.string().min(1),
  checkId: z.string().min(1),
});

/**
 * Schema for restoring stash
 */
const RestoreStashRequestSchema = z.object({
  stashRef: z.string().min(1),
});

/**
 * Schema for dry run
 */
const DryRunRequestSchema = z.object({
  taskId: z.string().min(1),
});

/**
 * Ensures orchestrator is available, throws 503 if not
 */
function requireOrchestrator() {
  const orchestrator = getOrchestrator();
  if (!orchestrator) {
    throw new AppError(
      "Orchestrator not initialized. Server may still be starting.",
      503,
      "SERVICE_UNAVAILABLE"
    );
  }
  return orchestrator;
}

/**
 * Creates the preflight router with all preflight endpoints
 */
export function createPreflightRoutes(): Hono {
  const router = new Hono();

  /**
   * POST /api/preflight/run
   *
   * Run preflight checks for a task.
   *
   * @param {string} body.taskId - The task ID to run preflight for
   * @returns {{ report: PreflightReportDTO }}
   * @throws {400} If validation fails
   * @throws {404} If task doesn't exist
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/run", async (c) => {
    const orchestrator = requireOrchestrator();

    // Parse and validate request
    const body = await c.req.json();
    const parseResult = PreflightRequestSchema.safeParse(body);

    if (!parseResult.success) {
      throw new AppError(
        `Invalid request: ${parseResult.error.errors.map(e => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    const { taskId } = parseResult.data;

    // Verify task exists
    const task = await orchestrator.getTask(taskId);
    if (!task) {
      throw new AppError(
        `Task "${taskId}" not found`,
        404,
        "TASK_NOT_FOUND"
      );
    }

    // Get config
    const config = await orchestrator.getConfig();

    // Create preflight context
    const context: PreflightContext = {
      taskId,
      task,
      config,
      workingDir: orchestrator.getWorkingDir(),
      getActiveBattle: () => orchestrator.getCurrentBattleState(),
    };

    // Run preflight
    const preflightService = new PreflightService(orchestrator.getWorkingDir());
    const report = await preflightService.runPreflight(context);

    // Convert to DTO (removes function references)
    const reportDTO = toPreflightReportDTO(report);

    return c.json({ report: reportDTO });
  });

  /**
   * POST /api/preflight/fix
   *
   * Attempt to fix a preflight issue.
   *
   * @param {string} body.taskId - The task ID
   * @param {string} body.checkId - The check ID to fix
   * @returns {{ result: FixResult, updatedCheck: PreflightCheckResultDTO }}
   * @throws {400} If validation fails or check has no fix
   * @throws {404} If task or check not found
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/fix", async (c) => {
    const orchestrator = requireOrchestrator();

    // Parse and validate request
    const body = await c.req.json();
    const parseResult = PreflightFixRequestSchema.safeParse(body);

    if (!parseResult.success) {
      throw new AppError(
        `Invalid request: ${parseResult.error.errors.map(e => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    const { taskId, checkId } = parseResult.data;

    // Verify task exists
    const task = await orchestrator.getTask(taskId);
    if (!task) {
      throw new AppError(
        `Task "${taskId}" not found`,
        404,
        "TASK_NOT_FOUND"
      );
    }

    // Get config
    const config = await orchestrator.getConfig();

    // Create preflight context
    const context: PreflightContext = {
      taskId,
      task,
      config,
      workingDir: orchestrator.getWorkingDir(),
      getActiveBattle: () => orchestrator.getCurrentBattleState(),
    };

    // Apply fix
    const preflightService = new PreflightService(orchestrator.getWorkingDir());
    const { result, updatedCheck } = await preflightService.applyFix(checkId, context);

    return c.json({
      result,
      updatedCheck: toPreflightCheckResultDTO(updatedCheck),
    });
  });

  /**
   * POST /api/preflight/restore-stash
   *
   * Restore stashed changes after battle completion or cancellation.
   *
   * @param {string} body.stashRef - The stash reference to restore
   * @returns {{ result: FixResult }}
   * @throws {400} If validation fails
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/restore-stash", async (c) => {
    const orchestrator = requireOrchestrator();

    // Parse and validate request
    const body = await c.req.json();
    const parseResult = RestoreStashRequestSchema.safeParse(body);

    if (!parseResult.success) {
      throw new AppError(
        `Invalid request: ${parseResult.error.errors.map(e => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    const { stashRef } = parseResult.data;

    // Restore stash
    const preflightService = new PreflightService(orchestrator.getWorkingDir());
    const result = await preflightService.restoreStash(stashRef);

    return c.json({ result });
  });

  /**
   * POST /api/preflight/dry-run
   *
   * Run dry run analysis for a task.
   * Shows what would happen without making changes.
   *
   * Based on: SPECS/10-preflight.md (Dry Run Feature section)
   *
   * @param {string} body.taskId - The task ID
   * @returns {{ result: DryRunResult }}
   * @throws {400} If validation fails
   * @throws {404} If task or PRD doesn't exist
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/dry-run", async (c) => {
    const orchestrator = requireOrchestrator();

    // Parse and validate request
    const body = await c.req.json();
    const parseResult = DryRunRequestSchema.safeParse(body);

    if (!parseResult.success) {
      throw new AppError(
        `Invalid request: ${parseResult.error.errors.map(e => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    const { taskId } = parseResult.data;

    // Verify task exists
    const task = await orchestrator.getTask(taskId);
    if (!task) {
      throw new AppError(
        `Task "${taskId}" not found`,
        404,
        "TASK_NOT_FOUND"
      );
    }

    // Get PRD (needed for prompt building)
    const prd = await orchestrator.getPRD();
    if (!prd) {
      throw new AppError(
        "No PRD found - create a PRD first",
        400,
        "NO_PRD"
      );
    }

    // Get config
    const config = await orchestrator.getConfig();

    // Build progress file path
    const workingDir = orchestrator.getWorkingDir();
    const progressFilePath = `.pokeralph/battles/${taskId}/progress.json`;

    // Create dry run context
    const dryRunContext: DryRunContext = {
      taskId,
      task,
      config,
      prd,
      workingDir,
      progressFilePath,
    };

    // Run dry run analysis using DryRunService
    const dryRunService = new DryRunService(workingDir);
    const result = await dryRunService.runDryRun(dryRunContext);

    return c.json({ result });
  });

  /**
   * POST /api/preflight/validate-token
   *
   * Validate a preflight token.
   *
   * @param {string} body.token - The preflight token to validate
   * @returns {{ valid: boolean, taskId?: string, expired?: boolean }}
   * @throws {400} If validation fails
   */
  router.post("/validate-token", async (c) => {
    const body = await c.req.json();

    if (!body.token || typeof body.token !== "string") {
      throw new AppError(
        "Token is required",
        400,
        "VALIDATION_ERROR"
      );
    }

    const decoded = validatePreflightToken(body.token);

    if (decoded) {
      return c.json({
        valid: true,
        taskId: decoded.taskId,
        timestamp: decoded.timestamp,
      });
    }

    return c.json({
      valid: false,
      expired: true,
    });
  });

  /**
   * GET /api/preflight/checks
   *
   * Returns list of available preflight checks.
   *
   * @returns {{ checks: Array<{ id, name, description, category, severity, hasAutoFix }> }}
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/checks", (c) => {
    const orchestrator = requireOrchestrator();

    const preflightService = new PreflightService(orchestrator.getWorkingDir());
    const checks = preflightService.getChecks();

    const checkList = checks.map(check => ({
      id: check.id,
      name: check.name,
      description: check.description,
      category: check.category,
      severity: check.severity,
      hasAutoFix: typeof check.fix === "function",
    }));

    return c.json({ checks: checkList });
  });

  return router;
}
