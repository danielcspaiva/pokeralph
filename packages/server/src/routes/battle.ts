/**
 * Battle routes for PokéRalph server
 *
 * Provides endpoints for controlling task execution (battles).
 * Supports starting, pausing, resuming, canceling, and approving battles.
 */

import { Hono } from "hono";
import { z } from "zod";
import { getOrchestrator } from "../index.ts";
import { AppError } from "../middleware/error-handler.ts";

/**
 * Schema for starting a battle
 */
const StartBattleSchema = z.object({
  mode: z.enum(["hitl", "yolo"]).optional(),
});

/**
 * Schema for canceling a battle
 */
const CancelBattleSchema = z.object({
  reason: z.string().optional(),
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
 * Creates the battle router with all battle control endpoints
 */
export function createBattleRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /api/battle/current
   *
   * Returns the current ongoing battle state.
   *
   * @returns {{ battle: BattleState | null, isRunning: boolean, isPaused: boolean, isAwaitingApproval: boolean }}
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/current", (c) => {
    const orchestrator = requireOrchestrator();

    const state = orchestrator.getCurrentBattleState();
    const isRunning = orchestrator.isBattleRunning();
    const isPaused = orchestrator.isBattlePaused();
    const isAwaitingApproval = orchestrator.isBattleAwaitingApproval();

    return c.json({
      battle: state,
      isRunning,
      isPaused,
      isAwaitingApproval,
    });
  });

  /**
   * POST /api/battle/start/:taskId
   *
   * Starts a battle for the specified task.
   *
   * @param {string} taskId - The task ID (URL parameter)
   * @param {string} body.mode - Optional execution mode ("hitl" or "yolo")
   * @returns {{ message: string, taskId: string, mode: string }}
   * @throws {400} If validation fails
   * @throws {404} If task doesn't exist
   * @throws {409} If battle already in progress
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/start/:taskId", async (c) => {
    const orchestrator = requireOrchestrator();
    const taskId = c.req.param("taskId");

    // Check if battle already in progress
    if (orchestrator.isBattleRunning() || orchestrator.isBattlePaused()) {
      const currentState = orchestrator.getCurrentBattleState();
      throw new AppError(
        `Battle already in progress for task "${currentState?.taskId}". Finish or cancel the current battle first.`,
        409,
        "BATTLE_IN_PROGRESS"
      );
    }

    // Verify task exists
    const task = await orchestrator.getTask(taskId);
    if (!task) {
      throw new AppError(
        `Task "${taskId}" not found`,
        404,
        "TASK_NOT_FOUND"
      );
    }

    // Parse optional body for mode
    let mode: "hitl" | "yolo" | undefined;
    try {
      const body = await c.req.json();
      const parseResult = StartBattleSchema.safeParse(body);
      if (parseResult.success) {
        mode = parseResult.data.mode;
      }
    } catch {
      // No body provided, use default mode from config
    }

    // Start the battle asynchronously (fire-and-forget)
    // Don't await - let it run in the background so the response returns immediately
    orchestrator.startBattle(taskId, mode).catch((err) => {
      console.error(`Battle error for task "${taskId}":`, err);
    });

    // Get the actual mode used (from config if not specified)
    const config = await orchestrator.getConfig();
    const actualMode = mode ?? config.mode;

    return c.json({
      message: "Battle started",
      taskId,
      mode: actualMode,
    });
  });

  /**
   * POST /api/battle/pause
   *
   * Pauses the current battle after the current iteration completes.
   *
   * @returns {{ message: string, taskId: string }}
   * @throws {409} If no battle is running
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/pause", (c) => {
    const orchestrator = requireOrchestrator();

    // Check if battle is running
    if (!orchestrator.isBattleRunning()) {
      throw new AppError(
        "No battle is currently running",
        409,
        "NO_BATTLE_RUNNING"
      );
    }

    const state = orchestrator.getCurrentBattleState();
    orchestrator.pauseBattle();

    return c.json({
      message: "Battle paused",
      taskId: state?.taskId,
    });
  });

  /**
   * POST /api/battle/resume
   *
   * Resumes a paused battle.
   *
   * @returns {{ message: string, taskId: string }}
   * @throws {409} If no battle is paused
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/resume", async (c) => {
    const orchestrator = requireOrchestrator();

    // Check if battle is paused
    if (!orchestrator.isBattlePaused()) {
      throw new AppError(
        "No battle is currently paused",
        409,
        "NO_BATTLE_PAUSED"
      );
    }

    const state = orchestrator.getCurrentBattleState();
    await orchestrator.resumeBattle();

    return c.json({
      message: "Battle resumed",
      taskId: state?.taskId,
    });
  });

  /**
   * POST /api/battle/cancel
   *
   * Cancels the current battle.
   *
   * @param {string} body.reason - Optional cancellation reason
   * @returns {{ message: string, taskId: string }}
   * @throws {409} If no battle is in progress
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/cancel", async (c) => {
    const orchestrator = requireOrchestrator();

    // Check if battle exists (running or paused)
    const state = orchestrator.getCurrentBattleState();
    if (!state) {
      throw new AppError(
        "No battle is currently in progress",
        409,
        "NO_BATTLE_IN_PROGRESS"
      );
    }

    // Parse optional reason
    let reason: string | undefined;
    try {
      const body = await c.req.json();
      const parseResult = CancelBattleSchema.safeParse(body);
      if (parseResult.success) {
        reason = parseResult.data.reason;
      }
    } catch {
      // No body provided
    }

    await orchestrator.cancelBattle(reason);

    return c.json({
      message: "Battle cancelled",
      taskId: state.taskId,
      reason: reason ?? null,
    });
  });

  /**
   * POST /api/battle/approve
   *
   * Approves the current iteration in HITL mode.
   *
   * @returns {{ message: string, taskId: string }}
   * @throws {409} If not awaiting approval
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/approve", (c) => {
    const orchestrator = requireOrchestrator();

    // Check if awaiting approval
    if (!orchestrator.isBattleAwaitingApproval()) {
      throw new AppError(
        "No battle is currently awaiting approval",
        409,
        "NOT_AWAITING_APPROVAL"
      );
    }

    const state = orchestrator.getCurrentBattleState();
    orchestrator.approveBattle();

    return c.json({
      message: "Iteration approved",
      taskId: state?.taskId,
    });
  });

  /**
   * GET /api/battle/:taskId/progress
   *
   * Returns the current progress for a task's battle.
   *
   * @param {string} taskId - The task ID (URL parameter)
   * @returns {{ progress: Progress | null }}
   * @throws {404} If task doesn't exist
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/:taskId/progress", async (c) => {
    const orchestrator = requireOrchestrator();
    const taskId = c.req.param("taskId");

    // Verify task exists
    const task = await orchestrator.getTask(taskId);
    if (!task) {
      throw new AppError(
        `Task "${taskId}" not found`,
        404,
        "TASK_NOT_FOUND"
      );
    }

    const progress = await orchestrator.getBattleProgress(taskId);

    return c.json({
      taskId,
      progress,
    });
  });

  /**
   * GET /api/battle/:taskId/history
   *
   * Returns the battle history for a task.
   *
   * @param {string} taskId - The task ID (URL parameter)
   * @returns {{ history: Battle | null }}
   * @throws {404} If task doesn't exist
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/:taskId/history", async (c) => {
    const orchestrator = requireOrchestrator();
    const taskId = c.req.param("taskId");

    // Verify task exists
    const task = await orchestrator.getTask(taskId);
    if (!task) {
      throw new AppError(
        `Task "${taskId}" not found`,
        404,
        "TASK_NOT_FOUND"
      );
    }

    const history = await orchestrator.getBattleHistory(taskId);

    return c.json({
      taskId,
      history,
    });
  });

  return router;
}
