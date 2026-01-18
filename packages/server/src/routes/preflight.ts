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
  type PreflightContext,
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
   * @param {string} body.taskId - The task ID
   * @returns {{ result: DryRunResult }}
   * @throws {400} If validation fails
   * @throws {404} If task doesn't exist
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

    // Get config
    const config = await orchestrator.getConfig();

    // Dry run is a Phase 9 enhancement (Task 025)
    // For now, return a basic dry run result
    const timestamp = new Date().toISOString();

    // Predict affected files from task description
    const filesLikelyAffected = predictAffectedFiles(task.description);

    // Estimate iterations based on task complexity
    const estimatedIterations = estimateIterations(task);

    const dryRunResult = {
      taskId,
      timestamp,
      prompt: {
        full: "[Prompt preview not available - use battle start for full prompt generation]",
        redacted: "[Prompt preview not available - use battle start for full prompt generation]",
        redactedFields: [],
      },
      promptTokens: 0, // Would require full prompt building
      filesLikelyAffected: {
        files: filesLikelyAffected,
        confidence: filesLikelyAffected.length > 0 ? "medium" as const : "low" as const,
        reason: filesLikelyAffected.length > 0
          ? "Files inferred from task keywords"
          : "No specific files identified, will depend on Claude's analysis",
      },
      estimatedIterations: {
        min: estimatedIterations.min,
        max: estimatedIterations.max,
        confidence: estimatedIterations.confidence,
        reason: estimatedIterations.reason,
      },
      estimatedDuration: {
        min: estimatedIterations.min * 3, // ~3 min per iteration
        max: estimatedIterations.max * 5, // ~5 min per iteration
        confidence: estimatedIterations.confidence,
        reason: "Based on iteration estimate and typical iteration duration",
      },
      existingFiles: [],
      contextSize: 0,
      config: {
        mode: config.mode,
        maxIterationsPerTask: config.maxIterationsPerTask,
        feedbackLoops: config.feedbackLoops,
        autoCommit: config.autoCommit,
      },
    };

    return c.json({ result: dryRunResult });
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

/**
 * Predict affected files from task description
 */
function predictAffectedFiles(description: string): string[] {
  const files: string[] = [];
  const patterns = [
    /(?:create|add|modify|update|edit)\s+(?:the\s+)?(\S+\.\w+)/gi,
    /(?:in|at)\s+(\S+\.\w+)/gi,
    /(\S+\.(ts|tsx|js|jsx|py|go|rs))/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(description);
    while (match !== null) {
      if (match[1] && !files.includes(match[1])) {
        files.push(match[1]);
      }
      match = pattern.exec(description);
    }
  }

  return files;
}

/**
 * Estimate iterations based on task complexity
 */
function estimateIterations(task: { acceptanceCriteria: string[]; description: string }): {
  min: number;
  max: number;
  confidence: "high" | "medium" | "low";
  reason: string;
} {
  const criteriaCount = task.acceptanceCriteria.length;
  const descLength = task.description.length;

  // Simple heuristics
  if (criteriaCount <= 2 && descLength < 200) {
    return {
      min: 1,
      max: 3,
      confidence: "high",
      reason: "Well-scoped task with few acceptance criteria",
    };
  }

  if (criteriaCount <= 5 && descLength < 500) {
    return {
      min: 2,
      max: 5,
      confidence: "medium",
      reason: "Moderately complex task",
    };
  }

  return {
    min: 3,
    max: 8,
    confidence: "low",
    reason: "Complex task with multiple criteria or long description",
  };
}
