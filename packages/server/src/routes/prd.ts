/**
 * PRD and Tasks routes for PokéRalph server
 *
 * Provides endpoints to manage the PRD (Product Requirements Document)
 * and individual tasks.
 */

import { Hono } from "hono";
import { z } from "zod";
import { PRDSchema, TaskStatus } from "@pokeralph/core";
import { getOrchestrator } from "../index.ts";
import { AppError } from "../middleware/error-handler.ts";

/**
 * Schema for creating a new task (without auto-generated fields)
 */
const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  priority: z.number().int().positive("Priority must be a positive integer"),
  acceptanceCriteria: z.array(z.string()),
});

/**
 * Schema for updating an existing task
 */
const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.number().int().positive().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
});

/**
 * Schema for updating the entire PRD
 */
const UpdatePRDSchema = PRDSchema.partial().extend({
  name: z.string().min(1).optional(),
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
 * Creates the PRD router with all PRD and task endpoints
 */
export function createPRDRoutes(): Hono {
  const router = new Hono();

  // ==========================================================================
  // PRD Endpoints
  // ==========================================================================

  /**
   * GET /api/prd
   *
   * Returns the complete PRD.
   *
   * @returns {PRD} The PRD object
   * @throws {404} If no PRD exists
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/", async (c) => {
    const orchestrator = requireOrchestrator();

    const prd = await orchestrator.getPRD();
    if (!prd) {
      throw new AppError(
        "No PRD found. Create a PRD first via planning or PUT /api/prd.",
        404,
        "PRD_NOT_FOUND"
      );
    }

    return c.json(prd);
  });

  /**
   * PUT /api/prd
   *
   * Updates the entire PRD. Can create a new PRD if none exists.
   *
   * @param {PRD} body - The PRD to save
   * @returns {PRD} The saved PRD
   * @throws {400} If validation fails
   * @throws {503} If orchestrator is not initialized
   */
  router.put("/", async (c) => {
    const orchestrator = requireOrchestrator();

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("Invalid JSON body", 400, "INVALID_JSON");
    }

    // Check if we're creating a new PRD or updating existing
    const existingPRD = await orchestrator.getPRD();

    if (existingPRD) {
      // Partial update - merge with existing
      const parseResult = UpdatePRDSchema.safeParse(body);
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
      const partialPRD = parseResult.data;
      if (Object.keys(partialPRD).length === 0) {
        throw new AppError("No PRD fields provided", 400, "EMPTY_UPDATE");
      }

      // Merge and save
      const updatedPRD = {
        ...existingPRD,
        ...partialPRD,
        updatedAt: new Date().toISOString(),
      };
      await orchestrator.savePRD(updatedPRD);
      return c.json(updatedPRD);
    }

    // Create new PRD - requires full object
    const parseResult = PRDSchema.safeParse(body);
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

    await orchestrator.savePRD(parseResult.data);
    return c.json(parseResult.data, 201);
  });

  // ==========================================================================
  // Tasks Endpoints
  // ==========================================================================

  /**
   * GET /api/prd/tasks
   *
   * Returns all tasks from the PRD.
   *
   * @returns {Task[]} Array of tasks
   * @throws {404} If no PRD exists
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/tasks", async (c) => {
    const orchestrator = requireOrchestrator();

    const prd = await orchestrator.getPRD();
    if (!prd) {
      throw new AppError(
        "No PRD found. Create a PRD first.",
        404,
        "PRD_NOT_FOUND"
      );
    }

    return c.json(prd.tasks);
  });

  /**
   * GET /api/prd/tasks/:id
   *
   * Returns a specific task by ID.
   *
   * @param {string} id - The task ID
   * @returns {Task} The task
   * @throws {404} If task or PRD not found
   * @throws {503} If orchestrator is not initialized
   */
  router.get("/tasks/:id", async (c) => {
    const orchestrator = requireOrchestrator();
    const taskId = c.req.param("id");

    const task = await orchestrator.getTask(taskId);
    if (!task) {
      throw new AppError(`Task "${taskId}" not found`, 404, "TASK_NOT_FOUND");
    }

    return c.json(task);
  });

  /**
   * POST /api/prd/tasks
   *
   * Creates a new task in the PRD.
   *
   * @param {CreateTaskInput} body - Task data
   * @returns {Task} The created task
   * @throws {400} If validation fails
   * @throws {404} If no PRD exists
   * @throws {503} If orchestrator is not initialized
   */
  router.post("/tasks", async (c) => {
    const orchestrator = requireOrchestrator();

    // Check if PRD exists
    const prd = await orchestrator.getPRD();
    if (!prd) {
      throw new AppError(
        "No PRD found. Create a PRD first before adding tasks.",
        404,
        "PRD_NOT_FOUND"
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("Invalid JSON body", 400, "INVALID_JSON");
    }

    const parseResult = CreateTaskSchema.safeParse(body);
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

    const newTask = await orchestrator.addTask(parseResult.data);
    return c.json(newTask, 201);
  });

  /**
   * PUT /api/prd/tasks/:id
   *
   * Updates an existing task.
   *
   * @param {string} id - The task ID
   * @param {UpdateTaskInput} body - Fields to update
   * @returns {Task} The updated task
   * @throws {400} If validation fails
   * @throws {404} If task not found
   * @throws {503} If orchestrator is not initialized
   */
  router.put("/tasks/:id", async (c) => {
    const orchestrator = requireOrchestrator();
    const taskId = c.req.param("id");

    // Check if task exists
    const existingTask = await orchestrator.getTask(taskId);
    if (!existingTask) {
      throw new AppError(`Task "${taskId}" not found`, 404, "TASK_NOT_FOUND");
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("Invalid JSON body", 400, "INVALID_JSON");
    }

    const parseResult = UpdateTaskSchema.safeParse(body);
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
    const partialTask = parseResult.data;
    if (Object.keys(partialTask).length === 0) {
      throw new AppError("No task fields provided", 400, "EMPTY_UPDATE");
    }

    const updatedTask = await orchestrator.updateTask(taskId, partialTask);
    return c.json(updatedTask);
  });

  /**
   * DELETE /api/prd/tasks/:id
   *
   * Removes a task from the PRD.
   *
   * @param {string} id - The task ID
   * @returns {void} 204 No Content on success
   * @throws {404} If task or PRD not found
   * @throws {503} If orchestrator is not initialized
   */
  router.delete("/tasks/:id", async (c) => {
    const orchestrator = requireOrchestrator();
    const taskId = c.req.param("id");

    // Get PRD and find task
    const prd = await orchestrator.getPRD();
    if (!prd) {
      throw new AppError("No PRD found", 404, "PRD_NOT_FOUND");
    }

    const taskIndex = prd.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw new AppError(`Task "${taskId}" not found`, 404, "TASK_NOT_FOUND");
    }

    // Remove task and save
    prd.tasks.splice(taskIndex, 1);
    prd.updatedAt = new Date().toISOString();
    await orchestrator.savePRD(prd);

    return new Response(null, { status: 204 });
  });

  return router;
}
