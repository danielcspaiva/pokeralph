import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import {
  createApp,
  initializeOrchestrator,
  resetServerState,
} from "../src/index.ts";
import { resetRecentRepos, getRecentRepos } from "../src/routes/repo.ts";

describe("Repo Routes", () => {
  let tempDir: string;
  let gitRepoDir: string;
  let nonGitDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Create unique temp directories for each test
    const testId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tempDir = join(tmpdir(), `pokeralph-repo-test-${testId}`);

    // Create a valid git repo
    gitRepoDir = join(tempDir, "git-repo");
    mkdirSync(join(gitRepoDir, ".git"), { recursive: true });

    // Create a non-git directory
    nonGitDir = join(tempDir, "non-git");
    mkdirSync(nonGitDir, { recursive: true });

    // Reset server state and recent repos
    resetServerState();
    resetRecentRepos();

    // Initialize orchestrator with the git repo
    initializeOrchestrator(gitRepoDir);

    // Create app for testing
    app = createApp();
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Reset server state
    resetServerState();
    resetRecentRepos();
  });

  // ==========================================================================
  // GET /api/repo/validate
  // ==========================================================================

  describe("GET /api/repo/validate", () => {
    test("returns valid=true for git repository", async () => {
      const res = await app.fetch(
        new Request(`http://localhost/api/repo/validate?path=${encodeURIComponent(gitRepoDir)}`)
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.exists).toBe(true);
      expect(data.isDirectory).toBe(true);
      expect(data.isGitRepo).toBe(true);
      expect(data.errors).toEqual([]);
    });

    test("returns valid=false for non-git directory", async () => {
      const res = await app.fetch(
        new Request(`http://localhost/api/repo/validate?path=${encodeURIComponent(nonGitDir)}`)
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.exists).toBe(true);
      expect(data.isDirectory).toBe(true);
      expect(data.isGitRepo).toBe(false);
      expect(data.errors).toContain("Not a git repository");
    });

    test("returns valid=false for non-existent path", async () => {
      const nonExistentPath = join(tempDir, "does-not-exist");
      const res = await app.fetch(
        new Request(`http://localhost/api/repo/validate?path=${encodeURIComponent(nonExistentPath)}`)
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.exists).toBe(false);
      expect(data.errors).toContain("Path does not exist");
    });

    test("returns 400 when path is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/repo/validate")
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("MISSING_PATH");
    });

    test("detects hasPokeralph when .pokeralph folder exists", async () => {
      // Create .pokeralph folder
      mkdirSync(join(gitRepoDir, ".pokeralph"), { recursive: true });

      const res = await app.fetch(
        new Request(`http://localhost/api/repo/validate?path=${encodeURIComponent(gitRepoDir)}`)
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.hasPokeralph).toBe(true);
    });
  });

  // ==========================================================================
  // POST /api/repo/select
  // ==========================================================================

  describe("POST /api/repo/select", () => {
    test("selects a valid git repository", async () => {
      // Create another git repo to switch to
      const newRepoDir = join(tempDir, "new-repo");
      mkdirSync(join(newRepoDir, ".git"), { recursive: true });

      const res = await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: newRepoDir }),
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.workingDir).toBe(newRepoDir);
    });

    test("returns 400 for non-existent path", async () => {
      const nonExistentPath = join(tempDir, "does-not-exist");

      const res = await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: nonExistentPath }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("INVALID_PATH");
    });

    test("returns 400 for non-git directory", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: nonGitDir }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("NOT_A_GIT_REPO");
    });

    test("returns 400 for invalid JSON", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not valid json",
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("INVALID_JSON");
    });

    test("returns 400 for missing path", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("adds repository to recent list", async () => {
      // Create another git repo
      const newRepoDir = join(tempDir, "new-repo-recent");
      mkdirSync(join(newRepoDir, ".git"), { recursive: true });

      await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: newRepoDir }),
        })
      );

      const recentRepos = getRecentRepos();
      expect(recentRepos.length).toBeGreaterThan(0);
      expect(recentRepos[0]?.path).toBe(newRepoDir);
    });
  });

  // ==========================================================================
  // GET /api/repo/current
  // ==========================================================================

  describe("GET /api/repo/current", () => {
    test("returns current repository info", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/repo/current")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workingDir).toBe(gitRepoDir);
      expect(typeof data.initialized).toBe("boolean");
      expect(typeof data.hasActiveBattle).toBe("boolean");
    });

    test("returns null workingDir when no orchestrator", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/repo/current")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workingDir).toBeNull();
      expect(data.initialized).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/repo/init
  // ==========================================================================

  describe("POST /api/repo/init", () => {
    test("returns 400 when no repository selected", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/repo/init", {
          method: "POST",
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("NO_REPO_SELECTED");
    });

    test("returns 409 when already initialized", async () => {
      // Create .pokeralph folder first
      mkdirSync(join(gitRepoDir, ".pokeralph"), { recursive: true });

      const res = await app.fetch(
        new Request("http://localhost/api/repo/init", {
          method: "POST",
        })
      );

      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.error).toBe("ALREADY_INITIALIZED");
    });
  });

  // ==========================================================================
  // GET /api/repo/recent
  // ==========================================================================

  describe("GET /api/repo/recent", () => {
    test("returns empty array initially", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/repo/recent")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.repos).toEqual([]);
    });

    test("returns recent repos after selection", async () => {
      // First select a repo
      const newRepoDir = join(tempDir, "new-repo-for-recent");
      mkdirSync(join(newRepoDir, ".git"), { recursive: true });

      await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: newRepoDir }),
        })
      );

      // Now get recent
      const res = await app.fetch(
        new Request("http://localhost/api/repo/recent")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.repos.length).toBeGreaterThan(0);
      expect(data.repos[0].path).toBe(newRepoDir);
      expect(data.repos[0].name).toBe("new-repo-for-recent");
      expect(data.repos[0].lastUsed).toBeDefined();
      expect(typeof data.repos[0].taskCount).toBe("number");
    });

    test("filters out deleted repos", async () => {
      // Create and select a repo
      const deleteableRepoDir = join(tempDir, "deleteable-repo");
      mkdirSync(join(deleteableRepoDir, ".git"), { recursive: true });

      await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: deleteableRepoDir }),
        })
      );

      // Delete the repo
      rmSync(deleteableRepoDir, { recursive: true, force: true });

      // Get recent - should filter out deleted
      const res = await app.fetch(
        new Request("http://localhost/api/repo/recent")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      const deletedRepo = data.repos.find((r: { path: string }) => r.path === deleteableRepoDir);
      expect(deletedRepo).toBeUndefined();
    });
  });

  // ==========================================================================
  // DELETE /api/repo/recent/:path
  // ==========================================================================

  describe("DELETE /api/repo/recent/:path", () => {
    test("removes a repo from recent list", async () => {
      // First add a repo to recent
      const repoToRemove = join(tempDir, "repo-to-remove");
      mkdirSync(join(repoToRemove, ".git"), { recursive: true });

      await app.fetch(
        new Request("http://localhost/api/repo/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: repoToRemove }),
        })
      );

      // Verify it's in recent
      let recentRepos = getRecentRepos();
      expect(recentRepos.some((r) => r.path === repoToRemove)).toBe(true);

      // Remove it
      const res = await app.fetch(
        new Request(`http://localhost/api/repo/recent/${encodeURIComponent(repoToRemove)}`, {
          method: "DELETE",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify it's removed
      recentRepos = getRecentRepos();
      expect(recentRepos.some((r) => r.path === repoToRemove)).toBe(false);
    });

    test("returns success=false for non-existent path in recent", async () => {
      const res = await app.fetch(
        new Request(`http://localhost/api/repo/recent/${encodeURIComponent("/non/existent/path")}`, {
          method: "DELETE",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });
});
