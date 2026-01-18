/**
 * ProjectDetection service for PokéRalph
 *
 * Detects project type, package manager, framework, and suggests appropriate
 * configuration based on the project structure.
 *
 * Implements 09-onboarding.md specification.
 */

import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { Config } from "../types/index.ts";
import { DEFAULT_CONFIG } from "../types/index.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Supported project types for detection
 */
export type ProjectType = "bun" | "node" | "python" | "go" | "rust" | "unknown";

/**
 * Result of project detection
 */
export interface ProjectDetection {
  type: ProjectType;
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | null;
  framework: string | null;
  testRunner: string | null;
  linter: string | null;
  typescript: boolean;
  existingPokeralph: boolean;
}

/**
 * Package.json structure (partial)
 */
interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

// ============================================================================
// Default configurations by project type
// ============================================================================

/**
 * Default configuration values per project type.
 * Unknown projects get conservative defaults for safety.
 */
export const PROJECT_DEFAULTS: Record<ProjectType, Partial<Config>> = {
  bun: {
    feedbackLoops: ["test", "lint", "typecheck"],
    maxIterationsPerTask: 10,
    timeoutMinutes: 30,
    mode: "hitl",
    autoCommit: true,
  },
  node: {
    feedbackLoops: ["test", "lint", "typecheck"],
    maxIterationsPerTask: 10,
    timeoutMinutes: 30,
    mode: "hitl",
    autoCommit: true,
  },
  python: {
    feedbackLoops: ["pytest", "ruff", "mypy"],
    maxIterationsPerTask: 10,
    timeoutMinutes: 30,
    mode: "hitl",
    autoCommit: true,
  },
  go: {
    feedbackLoops: ["go test", "golangci-lint"],
    maxIterationsPerTask: 10,
    timeoutMinutes: 30,
    mode: "hitl",
    autoCommit: true,
  },
  rust: {
    feedbackLoops: ["cargo test", "cargo clippy"],
    maxIterationsPerTask: 10,
    timeoutMinutes: 30,
    mode: "hitl",
    autoCommit: true,
  },
  unknown: {
    feedbackLoops: [],
    maxIterationsPerTask: 10,
    timeoutMinutes: 30,
    mode: "hitl",
    autoCommit: false, // Disabled by default for unknown projects to prevent accidental commits
  },
};

/**
 * Explanation for "unknown" project type defaults.
 * Displayed in UI to help users understand why settings are conservative.
 */
export const UNKNOWN_PROJECT_EXPLANATION = {
  title: "Project Type Not Detected",
  message: `We couldn't automatically detect your project type. For safety, we've applied conservative defaults:

• **No feedback loops**: You'll need to configure test/lint commands manually
• **Auto-commit disabled**: Changes won't be automatically committed
• **HITL mode enabled**: You'll review each iteration before continuing

This ensures Claude doesn't run commands that don't exist or commit changes unexpectedly.`,
  actions: [
    {
      id: "quick_configure",
      label: "Quick Configure",
      description: "Set up feedback loops and project settings",
      primary: true,
    },
    {
      id: "select_type",
      label: "Select Project Type",
      description: "Manually choose from Bun, Node, Python, Go, or Rust",
    },
    {
      id: "continue_anyway",
      label: "Continue with Defaults",
      description: "Proceed without feedback loops (not recommended)",
    },
  ],
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if a file or directory exists at the given path
 */
function exists(path: string): boolean {
  return existsSync(path);
}

/**
 * Check if a path is a directory
 */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file
 */
async function readJson<T>(path: string): Promise<T | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return await file.json();
  } catch {
    return null;
  }
}

/**
 * Detect framework from package.json dependencies
 */
function detectFramework(pkg: PackageJson): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps.next) return "nextjs";
  if (deps["@remix-run/react"]) return "remix";
  if (deps.nuxt) return "nuxt";
  if (deps.vue) return "vue";
  if (deps.react) return "react";
  if (deps.svelte) return "svelte";
  if (deps.hono) return "hono";
  if (deps.express) return "express";
  if (deps.fastify) return "fastify";
  if (deps["@nestjs/core"]) return "nestjs";

  return null;
}

/**
 * Detect test runner from package.json dependencies
 */
function detectTestRunner(pkg: PackageJson): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps.vitest) return "vitest";
  if (deps.jest) return "jest";
  if (deps.mocha) return "mocha";
  if (deps.ava) return "ava";
  if (pkg.scripts?.test?.includes("bun test")) return "bun:test";

  return null;
}

/**
 * Detect linter from package.json dependencies
 */
function detectLinter(pkg: PackageJson): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps["@biomejs/biome"]) return "biome";
  if (deps.eslint) return "eslint";
  if (deps.rome) return "rome";

  return null;
}

/**
 * Clear metadata fields that are incompatible with the target project type.
 * Prevents Node/Bun-specific fields from persisting when detecting Python/Go/Rust.
 *
 * This is important when:
 * - A project has both package.json and pyproject.toml (e.g., docs site + Python backend)
 * - User manually overrides detected type
 * - Migration from one ecosystem to another
 */
function clearIncompatibleMetadata(
  detection: ProjectDetection,
  targetType: ProjectType
): void {
  // If switching away from node/bun, clear node-specific fields
  if (targetType !== "node" && targetType !== "bun") {
    if (detection.type === "node" || detection.type === "bun") {
      detection.packageManager = null;
      detection.framework = null;
      detection.testRunner = null;
      detection.linter = null;
      detection.typescript = false;
    }
  }
}

/**
 * Detect project type and configuration from working directory.
 *
 * Detection order:
 * 1. Check for existing .pokeralph folder
 * 2. Check package.json (Bun/Node)
 * 3. Check for Python (pyproject.toml, requirements.txt)
 * 4. Check for Go (go.mod)
 * 5. Check for Rust (Cargo.toml)
 */
export async function detectProject(
  workingDir: string
): Promise<ProjectDetection> {
  const detection: ProjectDetection = {
    type: "unknown",
    packageManager: null,
    framework: null,
    testRunner: null,
    linter: null,
    typescript: false,
    existingPokeralph: false,
  };

  // Check for existing .pokeralph (use isDirectory since it's a folder)
  detection.existingPokeralph = isDirectory(join(workingDir, ".pokeralph"));

  // Check package.json
  const packageJsonPath = join(workingDir, "package.json");
  if (exists(packageJsonPath)) {
    const pkg = await readJson<PackageJson>(packageJsonPath);

    if (pkg) {
      // Detect package manager
      // Check for both bun.lockb (binary) and bun.lock (text, newer versions)
      if (
        exists(join(workingDir, "bun.lockb")) ||
        exists(join(workingDir, "bun.lock"))
      ) {
        detection.packageManager = "bun";
        detection.type = "bun";
      } else if (exists(join(workingDir, "pnpm-lock.yaml"))) {
        detection.packageManager = "pnpm";
        detection.type = "node";
      } else if (exists(join(workingDir, "yarn.lock"))) {
        detection.packageManager = "yarn";
        detection.type = "node";
      } else if (exists(join(workingDir, "package-lock.json"))) {
        detection.packageManager = "npm";
        detection.type = "node";
      } else {
        // Default to npm if package.json exists but no lockfile
        detection.packageManager = "npm";
        detection.type = "node";
      }

      // Detect TypeScript
      detection.typescript = !!(
        pkg.devDependencies?.typescript ||
        pkg.dependencies?.typescript ||
        exists(join(workingDir, "tsconfig.json"))
      );

      // Detect framework
      detection.framework = detectFramework(pkg);

      // Detect test runner
      detection.testRunner = detectTestRunner(pkg);

      // Detect linter
      detection.linter = detectLinter(pkg);
    }
  }

  // Check for Python project
  if (
    exists(join(workingDir, "pyproject.toml")) ||
    exists(join(workingDir, "requirements.txt"))
  ) {
    // Clear Node-specific metadata when switching to Python
    clearIncompatibleMetadata(detection, "python");
    detection.type = "python";
  }

  // Check for Go project
  if (exists(join(workingDir, "go.mod"))) {
    // Clear incompatible metadata when switching to Go
    clearIncompatibleMetadata(detection, "go");
    detection.type = "go";
  }

  // Check for Rust project
  if (exists(join(workingDir, "Cargo.toml"))) {
    // Clear incompatible metadata when switching to Rust
    clearIncompatibleMetadata(detection, "rust");
    detection.type = "rust";
  }

  return detection;
}

/**
 * Get suggested configuration based on project detection
 */
export function getSuggestedConfig(detection: ProjectDetection): Config {
  const projectDefaults = PROJECT_DEFAULTS[detection.type];
  return {
    ...DEFAULT_CONFIG,
    ...projectDefaults,
    pollingIntervalMs: DEFAULT_CONFIG.pollingIntervalMs,
  };
}

/**
 * Check if project has unknown type with low-trust defaults
 */
export function hasLowTrustDefaults(detection: ProjectDetection): boolean {
  return (
    detection.type === "unknown" ||
    PROJECT_DEFAULTS[detection.type].feedbackLoops?.length === 0
  );
}

/**
 * Get the appropriate explanation and actions for current detection state
 */
export function getDetectionGuidance(
  detection: ProjectDetection
): typeof UNKNOWN_PROJECT_EXPLANATION | null {
  if (detection.type === "unknown") {
    return UNKNOWN_PROJECT_EXPLANATION;
  }
  return null;
}
