import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import {
  detectProject,
  getSuggestedConfig,
  hasLowTrustDefaults,
  getDetectionGuidance,
  PROJECT_DEFAULTS,
} from "../src/services/project-detection.ts";

// Create a unique temp directory for each test
const getTempDir = () =>
  join(
    import.meta.dir,
    `.tmp-project-detection-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

describe("ProjectDetection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = getTempDir();
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // detectProject - Package Manager Detection
  // ============================================================================

  describe("detectProject - Package Manager", () => {
    test("detects Bun with bun.lockb (binary)", async () => {
      // Create package.json and bun.lockb
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lockb"), "binary lockfile content");

      const result = await detectProject(tempDir);

      expect(result.type).toBe("bun");
      expect(result.packageManager).toBe("bun");
    });

    test("detects Bun with bun.lock (text)", async () => {
      // Create package.json and bun.lock (text format, newer Bun versions)
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lock"), "text lockfile content");

      const result = await detectProject(tempDir);

      expect(result.type).toBe("bun");
      expect(result.packageManager).toBe("bun");
    });

    test("detects pnpm with pnpm-lock.yaml", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "pnpm-lock.yaml"), "lockfile: true");

      const result = await detectProject(tempDir);

      expect(result.type).toBe("node");
      expect(result.packageManager).toBe("pnpm");
    });

    test("detects yarn with yarn.lock", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "yarn.lock"), "# yarn lockfile v1");

      const result = await detectProject(tempDir);

      expect(result.type).toBe("node");
      expect(result.packageManager).toBe("yarn");
    });

    test("detects npm with package-lock.json", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(
        join(tempDir, "package-lock.json"),
        JSON.stringify({ lockfileVersion: 3 })
      );

      const result = await detectProject(tempDir);

      expect(result.type).toBe("node");
      expect(result.packageManager).toBe("npm");
    });

    test("defaults to npm when package.json exists but no lockfile", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );

      const result = await detectProject(tempDir);

      expect(result.type).toBe("node");
      expect(result.packageManager).toBe("npm");
    });
  });

  // ============================================================================
  // detectProject - Framework Detection
  // ============================================================================

  describe("detectProject - Framework", () => {
    test("detects Next.js", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          dependencies: { next: "^14.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.framework).toBe("nextjs");
    });

    test("detects React", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          dependencies: { react: "^18.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.framework).toBe("react");
    });

    test("detects Hono", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          dependencies: { hono: "^4.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.framework).toBe("hono");
    });

    test("detects Express", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          dependencies: { express: "^4.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.framework).toBe("express");
    });

    test("detects NestJS", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          dependencies: { "@nestjs/core": "^10.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.framework).toBe("nestjs");
    });

    test("returns null when no framework detected", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.framework).toBeNull();
    });
  });

  // ============================================================================
  // detectProject - Test Runner Detection
  // ============================================================================

  describe("detectProject - Test Runner", () => {
    test("detects Vitest", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          devDependencies: { vitest: "^1.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.testRunner).toBe("vitest");
    });

    test("detects Jest", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          devDependencies: { jest: "^29.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.testRunner).toBe("jest");
    });

    test("detects bun:test from test script", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          scripts: { test: "bun test" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.testRunner).toBe("bun:test");
    });
  });

  // ============================================================================
  // detectProject - Linter Detection
  // ============================================================================

  describe("detectProject - Linter", () => {
    test("detects Biome", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          devDependencies: { "@biomejs/biome": "^1.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.linter).toBe("biome");
    });

    test("detects ESLint", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          devDependencies: { eslint: "^8.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.linter).toBe("eslint");
    });
  });

  // ============================================================================
  // detectProject - TypeScript Detection
  // ============================================================================

  describe("detectProject - TypeScript", () => {
    test("detects TypeScript from devDependencies", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          devDependencies: { typescript: "^5.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.typescript).toBe(true);
    });

    test("detects TypeScript from dependencies", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          dependencies: { typescript: "^5.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.typescript).toBe(true);
    });

    test("detects TypeScript from tsconfig.json", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.typescript).toBe(true);
    });

    test("returns false when no TypeScript indicators", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const result = await detectProject(tempDir);

      expect(result.typescript).toBe(false);
    });
  });

  // ============================================================================
  // detectProject - Non-JavaScript Project Types
  // ============================================================================

  describe("detectProject - Non-JavaScript Projects", () => {
    test("detects Python project from pyproject.toml", async () => {
      await Bun.write(join(tempDir, "pyproject.toml"), "[project]");

      const result = await detectProject(tempDir);

      expect(result.type).toBe("python");
    });

    test("detects Python project from requirements.txt", async () => {
      await Bun.write(join(tempDir, "requirements.txt"), "requests==2.28.0");

      const result = await detectProject(tempDir);

      expect(result.type).toBe("python");
    });

    test("detects Go project from go.mod", async () => {
      await Bun.write(join(tempDir, "go.mod"), "module example.com/test");

      const result = await detectProject(tempDir);

      expect(result.type).toBe("go");
    });

    test("detects Rust project from Cargo.toml", async () => {
      await Bun.write(
        join(tempDir, "Cargo.toml"),
        '[package]\nname = "test"'
      );

      const result = await detectProject(tempDir);

      expect(result.type).toBe("rust");
    });

    test("clears Node metadata when detecting Python in mixed project", async () => {
      // Project with both package.json and pyproject.toml
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          devDependencies: { typescript: "^5.0.0" },
        })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");
      await Bun.write(join(tempDir, "pyproject.toml"), "[project]");

      const result = await detectProject(tempDir);

      expect(result.type).toBe("python");
      expect(result.packageManager).toBeNull();
      expect(result.framework).toBeNull();
      expect(result.typescript).toBe(false);
    });
  });

  // ============================================================================
  // detectProject - Existing .pokeralph Detection
  // ============================================================================

  describe("detectProject - Existing .pokeralph", () => {
    test("detects existing .pokeralph folder", async () => {
      mkdirSync(join(tempDir, ".pokeralph"), { recursive: true });

      const result = await detectProject(tempDir);

      expect(result.existingPokeralph).toBe(true);
    });

    test("returns false when no .pokeralph folder", async () => {
      const result = await detectProject(tempDir);

      expect(result.existingPokeralph).toBe(false);
    });
  });

  // ============================================================================
  // detectProject - Unknown Project Type
  // ============================================================================

  describe("detectProject - Unknown Type", () => {
    test("returns unknown type for empty directory", async () => {
      const result = await detectProject(tempDir);

      expect(result.type).toBe("unknown");
      expect(result.packageManager).toBeNull();
      expect(result.framework).toBeNull();
      expect(result.testRunner).toBeNull();
      expect(result.linter).toBeNull();
      expect(result.typescript).toBe(false);
    });
  });

  // ============================================================================
  // getSuggestedConfig
  // ============================================================================

  describe("getSuggestedConfig", () => {
    test("returns Bun defaults for Bun projects", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const detection = await detectProject(tempDir);
      const config = getSuggestedConfig(detection);

      expect(config.feedbackLoops).toEqual(["test", "lint", "typecheck"]);
      expect(config.autoCommit).toBe(true);
      expect(config.mode).toBe("hitl");
    });

    test("returns Python defaults for Python projects", async () => {
      await Bun.write(join(tempDir, "pyproject.toml"), "[project]");

      const detection = await detectProject(tempDir);
      const config = getSuggestedConfig(detection);

      expect(config.feedbackLoops).toEqual(["pytest", "ruff", "mypy"]);
      expect(config.autoCommit).toBe(true);
      expect(config.mode).toBe("hitl");
    });

    test("returns Go defaults for Go projects", async () => {
      await Bun.write(join(tempDir, "go.mod"), "module example.com/test");

      const detection = await detectProject(tempDir);
      const config = getSuggestedConfig(detection);

      expect(config.feedbackLoops).toEqual(["go test", "golangci-lint"]);
      expect(config.autoCommit).toBe(true);
    });

    test("returns Rust defaults for Rust projects", async () => {
      await Bun.write(join(tempDir, "Cargo.toml"), '[package]\nname = "test"');

      const detection = await detectProject(tempDir);
      const config = getSuggestedConfig(detection);

      expect(config.feedbackLoops).toEqual(["cargo test", "cargo clippy"]);
      expect(config.autoCommit).toBe(true);
    });

    test("returns conservative defaults for unknown projects", async () => {
      const detection = await detectProject(tempDir);
      const config = getSuggestedConfig(detection);

      expect(config.feedbackLoops).toEqual([]);
      expect(config.autoCommit).toBe(false); // Disabled for safety
      expect(config.mode).toBe("hitl");
    });
  });

  // ============================================================================
  // hasLowTrustDefaults
  // ============================================================================

  describe("hasLowTrustDefaults", () => {
    test("returns true for unknown project type", async () => {
      const detection = await detectProject(tempDir);

      expect(hasLowTrustDefaults(detection)).toBe(true);
    });

    test("returns false for Bun project", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const detection = await detectProject(tempDir);

      expect(hasLowTrustDefaults(detection)).toBe(false);
    });
  });

  // ============================================================================
  // getDetectionGuidance
  // ============================================================================

  describe("getDetectionGuidance", () => {
    test("returns guidance for unknown project type", async () => {
      const detection = await detectProject(tempDir);
      const guidance = getDetectionGuidance(detection);

      expect(guidance).not.toBeNull();
      expect(guidance?.title).toBe("Project Type Not Detected");
      expect(guidance?.actions).toHaveLength(3);
    });

    test("returns null for known project type", async () => {
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lock"), "");

      const detection = await detectProject(tempDir);
      const guidance = getDetectionGuidance(detection);

      expect(guidance).toBeNull();
    });
  });

  // ============================================================================
  // PROJECT_DEFAULTS
  // ============================================================================

  describe("PROJECT_DEFAULTS", () => {
    test("defines defaults for all project types", () => {
      expect(PROJECT_DEFAULTS.bun).toBeDefined();
      expect(PROJECT_DEFAULTS.node).toBeDefined();
      expect(PROJECT_DEFAULTS.python).toBeDefined();
      expect(PROJECT_DEFAULTS.go).toBeDefined();
      expect(PROJECT_DEFAULTS.rust).toBeDefined();
      expect(PROJECT_DEFAULTS.unknown).toBeDefined();
    });

    test("unknown type has empty feedback loops", () => {
      expect(PROJECT_DEFAULTS.unknown.feedbackLoops).toEqual([]);
    });

    test("unknown type has autoCommit disabled", () => {
      expect(PROJECT_DEFAULTS.unknown.autoCommit).toBe(false);
    });
  });
});
