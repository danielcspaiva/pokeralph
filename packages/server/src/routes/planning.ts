/**
 * Planning routes for PokéRalph server
 *
 * Provides endpoints for the planning phase where users describe ideas
 * and Claude helps refine them into a structured PRD.
 */

import { Hono } from "hono";

// Strategic logging helper
const log = (action: string, data?: unknown) => {
  console.log(`[PokéRalph][Planning] ${action}`, data ? JSON.stringify(data, null, 2) : "");
};
import { z } from "zod";
import { getOrchestrator } from "../index.ts";
import { AppError } from "../middleware/error-handler.ts";

/**
 * Schema for starting a planning session
 */
const StartPlanningSchema = z.object({
  idea: z.string().min(1, "Idea is required"),
});

/**
 * Schema for answering a question during planning
 */
const AnswerQuestionSchema = z.object({
  answer: z.string().min(1, "Answer is required"),
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
 * Creates the planning router with all planning phase endpoints
 */
export function createPlanningRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /api/planning/status
   *
   * Returns the current planning state.
   * Matches spec: GET /api/planning/state
   *
   * @returns {{ state: PlanningState, pendingQuestion: string | null, hasOutput: boolean }}
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/status", (c) => {
    const orchestrator = requireOrchestrator();

    const state = orchestrator.getPlanningState();
    const pendingQuestion = orchestrator.getPlanningQuestion();
    const hasOutput = orchestrator.hasPlanningOutput();

    log("GET /status", { state, pendingQuestion, hasOutput, isPlanning: orchestrator.isPlanning() });

    return c.json({
      state,
      pendingQuestion,
      hasOutput,
      isPlanning: orchestrator.isPlanning(),
    });
  });

  /**
   * POST /api/planning/start
   *
   * Starts a new planning session with the given idea.
   *
   * @param {string} body.idea - The initial idea to refine
   * @returns {{ message: string, state: string }}
   * @throws {400} If validation fails
   * @throws {409} If planning already in progress
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/start", async (c) => {
    const orchestrator = requireOrchestrator();

    // Check if already planning
    if (orchestrator.isPlanning()) {
      throw new AppError(
        "Planning session already in progress. Finish or reset the current session first.",
        409,
        "PLANNING_IN_PROGRESS"
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("Invalid JSON body", 400, "INVALID_JSON");
    }

    const parseResult = StartPlanningSchema.safeParse(body);
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

    const { idea } = parseResult.data;

    log("POST /start", { idea: idea.substring(0, 100) + (idea.length > 100 ? "..." : "") });

    // Start planning (async - doesn't wait for Claude to finish)
    await orchestrator.startPlanning(idea);

    const response = {
      message: "Planning session started",
      idea,
      state: orchestrator.getPlanningState(),
    };
    log("POST /start response", { state: response.state });

    return c.json(response);
  });

  /**
   * POST /api/planning/answer
   *
   * Sends an answer to Claude's question during planning.
   *
   * @param {string} body.answer - The user's answer
   * @returns {{ message: string, state: string }}
   * @throws {400} If validation fails or not waiting for input
   * @throws {409} If not in waiting_input state
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/answer", async (c) => {
    const orchestrator = requireOrchestrator();

    // Check if we're waiting for input
    // Accept either explicit waiting_input state OR presence of a pending question
    // This handles the race condition where pendingQuestion is set but state hasn't fully transitioned
    const state = orchestrator.getPlanningState();
    const pendingQuestion = orchestrator.getPlanningQuestion();

    if (state !== "waiting_input" && !pendingQuestion) {
      throw new AppError(
        `Not waiting for input. Current state: ${state}`,
        409,
        "NOT_WAITING_INPUT"
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("Invalid JSON body", 400, "INVALID_JSON");
    }

    const parseResult = AnswerQuestionSchema.safeParse(body);
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

    const { answer } = parseResult.data;

    log("POST /answer", { answer: answer.substring(0, 100) + (answer.length > 100 ? "..." : "") });

    // Send answer to Claude
    await orchestrator.answerPlanningQuestion(answer);

    const response = {
      message: "Answer sent",
      state: orchestrator.getPlanningState(),
    };
    log("POST /answer response", { state: response.state });

    return c.json(response);
  });

  /**
   * POST /api/planning/finish
   *
   * Finalizes the planning phase and extracts the PRD.
   *
   * @returns {{ message: string, prd: PRD }}
   * @throws {409} If no planning session to finish
   * @throws {500} If PRD extraction fails
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/finish", async (c) => {
    const orchestrator = requireOrchestrator();

    // Check state
    const state = orchestrator.getPlanningState();
    if (state === "idle") {
      throw new AppError(
        "No planning session to finish. Start a planning session first.",
        409,
        "NO_PLANNING_SESSION"
      );
    }

    log("POST /finish - starting");

    try {
      // Finish planning and extract PRD
      const prd = await orchestrator.finishPlanning();

      log("POST /finish - PRD extracted", { name: prd.name, taskCount: prd.tasks?.length ?? 0 });

      // Save the PRD
      await orchestrator.savePRD(prd);

      log("POST /finish - PRD saved successfully");

      return c.json({
        message: "Planning completed successfully",
        prd,
      });
    } catch (error) {
      log("POST /finish - ERROR", { error: error instanceof Error ? error.message : error });
      if (error instanceof Error) {
        throw new AppError(
          `Failed to finish planning: ${error.message}`,
          500,
          "PLANNING_FINISH_FAILED"
        );
      }
      throw error;
    }
  });

  /**
   * POST /api/planning/refine-tasks
   *
   * Break PRD into refined tasks using Claude.
   * Per spec 02-planning.md: Uses current PRD to generate refined task list.
   *
   * @returns {{ success: boolean, tasks: Task[] }}
   * @throws {400} If no PRD exists
   * @throws {500} If task parsing fails
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/refine-tasks", async (c) => {
    const orchestrator = requireOrchestrator();

    // Get current PRD
    const prd = await orchestrator.getPRD();
    if (!prd) {
      throw new AppError("No PRD exists. Complete planning first.", 400, "NO_PRD");
    }

    log("POST /refine-tasks - starting task refinement");

    try {
      // Generate refined tasks
      const tasks = await orchestrator.breakIntoTasks(prd);

      // Update PRD with new tasks
      const updatedPRD = {
        ...prd,
        tasks,
        updatedAt: new Date().toISOString(),
      };

      // Save updated PRD
      await orchestrator.savePRD(updatedPRD);

      log("POST /refine-tasks - tasks refined", { count: tasks.length });

      return c.json({
        success: true,
        tasks,
      });
    } catch (error) {
      log("POST /refine-tasks - ERROR", { error: error instanceof Error ? error.message : error });
      throw new AppError(
        `Failed to refine tasks: ${error instanceof Error ? error.message : error}`,
        500,
        "TASK_PARSE_FAILED"
      );
    }
  });

  /**
   * POST /api/planning/breakdown
   *
   * Breaks down the current PRD into more detailed tasks.
   * Replaces existing tasks with the refined breakdown.
   * Note: This is an alias for /refine-tasks for backward compatibility.
   *
   * @returns {{ message: string, tasks: Task[], prd: PRD }}
   * @throws {409} If no PRD exists
   * @throws {500} If breakdown fails
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/breakdown", async (c) => {
    const orchestrator = requireOrchestrator();

    // Get current PRD
    const prd = await orchestrator.getPRD();
    if (!prd) {
      throw new AppError("No PRD exists. Complete planning first.", 409, "NO_PRD");
    }

    log("POST /breakdown - starting task breakdown");

    try {
      // Generate detailed tasks
      const tasks = await orchestrator.breakIntoTasks(prd);

      // Update PRD with new tasks
      const updatedPRD = {
        ...prd,
        tasks,
        updatedAt: new Date().toISOString(),
      };

      // Save updated PRD
      await orchestrator.savePRD(updatedPRD);

      log("POST /breakdown - tasks generated", { count: tasks.length });

      return c.json({
        message: "Tasks refined successfully",
        tasks,
        prd: updatedPRD,
      });
    } catch (error) {
      log("POST /breakdown - ERROR", { error: error instanceof Error ? error.message : error });
      throw new AppError(
        `Failed to break down PRD: ${error instanceof Error ? error.message : error}`,
        500,
        "BREAKDOWN_FAILED"
      );
    }
  });

  /**
   * POST /api/planning/reset
   *
   * Resets the planning service to idle state.
   * Use this to cancel an in-progress planning session.
   *
   * @returns {{ message: string, state: string }}
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/reset", (c) => {
    const orchestrator = requireOrchestrator();

    log("POST /reset - resetting planning session");

    orchestrator.resetPlanning();

    log("POST /reset - complete", { state: orchestrator.getPlanningState() });

    return c.json({
      message: "Planning session reset",
      state: orchestrator.getPlanningState(),
    });
  });

  return router;
}
