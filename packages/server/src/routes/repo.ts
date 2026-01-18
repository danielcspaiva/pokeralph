/**
 * Repository management routes for PokéRalph server
 *
 * Handles repository selection, validation, initialization, and recent repos.
 * Per spec: 08-repositories.md
 */

import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { Hono } from "hono";
import { z } from "zod";
import { getOrchestrator, switchOrchestrator } from "../index.ts";
import { AppError } from "../middleware/error-handler.ts";
import { getWebSocketManager } from "../websocket/index.ts";

/**
 * Schema for validating repository select requests
 */
const SelectRepoSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

/**
 * Recent repository entry
 */
interface RecentRepo {
  path: string;
  name: string;
  lastUsed: string; // ISO timestamp
  taskCount: number;
}

/**
 * In-memory storage for recent repositories (persists during server lifetime)
 * TODO: Persist to disk in a future enhancement
 */
let recentRepos: RecentRepo[] = [];

/**
 * Maximum number of recent repositories to store
 */
const MAX_RECENT_REPOS = 10;

/**
 * Validates a path as a potential repository
 */
function validatePath(path: string): {
  valid: boolean;
  exists: boolean;
  isDirectory: boolean;
  isGitRepo: boolean;
  hasPokeralph: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let exists = false;
  let isDirectory = false;
  let isGitRepo = false;
  let hasPokeralph = false;

  try {
    exists = existsSync(path);
    if (!exists) {
      errors.push("Path does not exist");
    }
  } catch {
    errors.push("Cannot access path");
  }

  if (exists) {
    try {
      const stats = statSync(path);
      isDirectory = stats.isDirectory();
      if (!isDirectory) {
        errors.push("Path is not a directory");
      }
    } catch {
      errors.push("Cannot read directory");
    }
  }

  if (isDirectory) {
    // Check for .git folder
    const gitPath = `${path}/.git`;
    try {
      isGitRepo = existsSync(gitPath) && statSync(gitPath).isDirectory();
      if (!isGitRepo) {
        errors.push("Not a git repository");
      }
    } catch {
      errors.push("Not a git repository");
    }

    // Check for .pokeralph folder
    const pokeralphPath = `${path}/.pokeralph`;
    try {
      hasPokeralph = existsSync(pokeralphPath) && statSync(pokeralphPath).isDirectory();
    } catch {
      // Not an error - just means folder doesn't exist
    }
  }

  return {
    valid: exists && isDirectory && isGitRepo,
    exists,
    isDirectory,
    isGitRepo,
    hasPokeralph,
    errors,
  };
}

/**
 * Adds or updates a repository in the recent list
 */
function addToRecentRepos(path: string, taskCount = 0): void {
  const name = path.split("/").pop() ?? path;
  const lastUsed = new Date().toISOString();

  // Remove existing entry if present
  recentRepos = recentRepos.filter((r) => r.path !== path);

  // Add to front of list
  recentRepos.unshift({ path, name, lastUsed, taskCount });

  // Trim to max size
  if (recentRepos.length > MAX_RECENT_REPOS) {
    recentRepos = recentRepos.slice(0, MAX_RECENT_REPOS);
  }
}

/**
 * Removes a repository from the recent list
 */
function removeFromRecentRepos(path: string): boolean {
  const initialLength = recentRepos.length;
  recentRepos = recentRepos.filter((r) => r.path !== path);
  return recentRepos.length < initialLength;
}

/**
 * Creates the repository router with all endpoints per spec
 */
export function createRepoRoutes(): Hono {
  const router = new Hono();

  // ==========================================================================
  // POST /api/repo/select - Select and initialize repository (spec lines 116-147)
  // ==========================================================================

  /**
   * POST /api/repo/select
   *
   * Select and initialize a repository.
   *
   * @param {{ path: string }} body - Absolute path to repository
   * @returns {{ success, workingDir, initialized, config, prd, taskCount, hasActiveBattle }}
   */
  router.post("/select", async (c) => {
    // Parse and validate request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError("Invalid JSON body", 400, "INVALID_JSON");
    }

    const parseResult = SelectRepoSchema.safeParse(body);
    if (!parseResult.success) {
      throw new AppError("Path is required", 400, "VALIDATION_ERROR");
    }

    // Resolve to absolute path
    const newPath = resolve(parseResult.data.path);

    // Validate the path
    const validation = validatePath(newPath);

    if (!validation.exists) {
      throw new AppError(`Path does not exist: ${newPath}`, 400, "INVALID_PATH");
    }

    if (!validation.isDirectory) {
      throw new AppError(`Path is not a directory: ${newPath}`, 400, "NOT_A_DIRECTORY");
    }

    if (!validation.isGitRepo) {
      throw new AppError(`Not a git repository: ${newPath}`, 400, "NOT_A_GIT_REPO");
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

    const wasInitialized = validation.hasPokeralph;

    try {
      // Switch to new working directory (will create .pokeralph/ if needed)
      const orchestrator = await switchOrchestrator(newPath);

      // Get state from new orchestrator
      let config = null;
      let prd = null;
      let taskCount = 0;

      try {
        config = await orchestrator.getConfig();
      } catch {
        // Config not found - will use defaults
      }

      try {
        prd = await orchestrator.getPRD();
        taskCount = prd?.tasks?.length ?? 0;
      } catch {
        // PRD not found
      }

      const hasActiveBattle = orchestrator.isBattleRunning();

      // Add to recent repos
      addToRecentRepos(newPath, taskCount);

      // Broadcast repo_changed event via WebSocket
      const wsManager = getWebSocketManager();
      wsManager.broadcast("repo_changed", {
        workingDir: newPath,
        initialized: wasInitialized,
      });

      return c.json({
        success: true,
        workingDir: newPath,
        initialized: wasInitialized,
        config,
        prd,
        taskCount,
        hasActiveBattle,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? error.message : "Failed to initialize repository";
      throw new AppError(message, 500, "INIT_FAILED");
    }
  });

  // ==========================================================================
  // GET /api/repo/current - Get current repository info (spec lines 150-164)
  // ==========================================================================

  /**
   * GET /api/repo/current
   *
   * Get current repository info.
   *
   * @returns {{ workingDir, initialized, config, prd, taskCount, hasActiveBattle }}
   */
  router.get("/current", async (c) => {
    const orchestrator = getOrchestrator();

    if (!orchestrator) {
      return c.json({
        workingDir: null,
        initialized: false,
        config: null,
        prd: null,
        taskCount: 0,
        hasActiveBattle: false,
      });
    }

    const workingDir = orchestrator.getWorkingDir();
    const validation = validatePath(workingDir);

    let config = null;
    let prd = null;
    let taskCount = 0;

    try {
      config = await orchestrator.getConfig();
    } catch {
      // Config not found
    }

    try {
      prd = await orchestrator.getPRD();
      taskCount = prd?.tasks?.length ?? 0;
    } catch {
      // PRD not found
    }

    return c.json({
      workingDir,
      initialized: validation.hasPokeralph,
      config,
      prd,
      taskCount,
      hasActiveBattle: orchestrator.isBattleRunning(),
    });
  });

  // ==========================================================================
  // POST /api/repo/init - Initialize .pokeralph folder (spec lines 168-185)
  // ==========================================================================

  /**
   * POST /api/repo/init
   *
   * Initialize .pokeralph/ in current repository.
   *
   * @returns {{ success: boolean, message: string }}
   */
  router.post("/init", async (c) => {
    const orchestrator = getOrchestrator();

    if (!orchestrator) {
      throw new AppError(
        "No repository selected. Select a repository first.",
        400,
        "NO_REPO_SELECTED"
      );
    }

    const workingDir = orchestrator.getWorkingDir();
    const validation = validatePath(workingDir);

    if (validation.hasPokeralph) {
      throw new AppError(
        ".pokeralph/ already exists in this repository",
        409,
        "ALREADY_INITIALIZED"
      );
    }

    try {
      await orchestrator.init();
      return c.json({
        success: true,
        message: "Repository initialized successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize repository";
      throw new AppError(message, 500, "INIT_FAILED");
    }
  });

  // ==========================================================================
  // GET /api/repo/validate - Validate a path (spec lines 188-205)
  // ==========================================================================

  /**
   * GET /api/repo/validate
   *
   * Validate a path as a potential repository.
   *
   * @query path - Absolute path to validate
   * @returns {{ valid, exists, isDirectory, isGitRepo, hasPokeralph, errors }}
   */
  router.get("/validate", async (c) => {
    const pathParam = c.req.query("path");

    if (!pathParam) {
      throw new AppError("Path query parameter is required", 400, "MISSING_PATH");
    }

    const absolutePath = resolve(pathParam);
    const validation = validatePath(absolutePath);

    return c.json(validation);
  });

  // ==========================================================================
  // GET /api/repo/recent - Get recent repositories (spec lines 209-223)
  // ==========================================================================

  /**
   * GET /api/repo/recent
   *
   * Get recently used repositories.
   *
   * @returns {{ repos: RecentRepo[] }}
   */
  router.get("/recent", async (c) => {
    // Validate paths still exist and update task counts
    const validatedRepos: RecentRepo[] = [];

    for (const repo of recentRepos) {
      const validation = validatePath(repo.path);
      if (validation.valid) {
        validatedRepos.push(repo);
      }
    }

    // Update storage with only valid repos
    recentRepos = validatedRepos;

    return c.json({ repos: validatedRepos });
  });

  // ==========================================================================
  // DELETE /api/repo/recent/:path - Remove from recent (spec lines 227-236)
  // ==========================================================================

  /**
   * DELETE /api/repo/recent/:path
   *
   * Remove a repository from recent list.
   *
   * @param path - URL-encoded path to remove
   * @returns {{ success: boolean }}
   */
  router.delete("/recent/:path", async (c) => {
    const encodedPath = c.req.param("path");
    const decodedPath = decodeURIComponent(encodedPath);

    const removed = removeFromRecentRepos(decodedPath);

    return c.json({ success: removed });
  });

  return router;
}

/**
 * Exported for testing - reset recent repos
 */
export function resetRecentRepos(): void {
  recentRepos = [];
}

/**
 * Exported for testing - get recent repos
 */
export function getRecentRepos(): RecentRepo[] {
  return [...recentRepos];
}
