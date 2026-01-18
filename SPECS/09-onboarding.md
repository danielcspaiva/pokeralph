# 09 - Onboarding Specification

## Purpose

Onboarding guides new users through their first experience with PokéRalph. It includes project detection, initial configuration, and guidance to create the first PRD. A smooth onboarding experience is critical for user adoption and understanding.

## User Stories

### US-OB-1: First-Time Launch
**As a** new user
**I want** clear guidance when I first open PokéRalph
**So that** I understand how to get started

**Acceptance Criteria:**
- Welcome screen explains the tool
- Clear call-to-action to begin
- Skip option for experienced users
- Progress indicator through setup

### US-OB-2: Project Detection
**As a** developer
**I want** PokéRalph to detect my project type
**So that** configuration is pre-filled appropriately

**Acceptance Criteria:**
- Detect package.json (Bun/Node)
- Detect project frameworks
- Suggest appropriate feedback loops
- Detect existing .pokeralph folder

### US-OB-3: Initial Configuration
**As a** developer
**I want** sensible defaults based on my project
**So that** I can start quickly

**Acceptance Criteria:**
- Pre-filled feedback loops
- Reasonable iteration limits
- Default to HITL mode
- Easy customization option

### US-OB-4: First PRD Guidance
**As a** new user
**I want** help creating my first PRD
**So that** I understand the planning process

**Acceptance Criteria:**
- Example prompts provided
- Template selection
- Explanation of planning flow
- Success celebration on completion

---

## Onboarding Flow

### Flow Diagram

```
┌──────────────────┐
│   First Launch   │
│   Detection      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐    No     ┌──────────────────┐
│ Existing Config? │─────────▶│  Welcome Screen  │
└────────┬─────────┘          └────────┬─────────┘
         │ Yes                         │
         │                             ▼
         │               ┌──────────────────┐
         │               │ Project Detection │
         │               └────────┬─────────┘
         │                        │
         │                        ▼
         │               ┌──────────────────┐
         │               │ Config Wizard    │
         │               └────────┬─────────┘
         │                        │
         │                        ▼
         │               ┌──────────────────┐
         │               │ First PRD Guide  │
         │               └────────┬─────────┘
         │                        │
         ▼                        ▼
┌──────────────────────────────────────────┐
│              Dashboard                   │
└──────────────────────────────────────────┘
```

---

## Welcome Screen

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│                    Welcome to PokéRalph!                           │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │    Transform your development into a Pokemon battle!        │ │
│  │                                                              │ │
│  │    PokéRalph runs Claude Code in autonomous loops to        │ │
│  │    complete your tasks. Each task is a "battle" where       │ │
│  │    Claude iterates until tests pass and work is done.       │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ 1. Plan         │  │ 2. Battle       │  │ 3. Ship         │   │
│  │                 │  │                 │  │                 │   │
│  │ Describe your   │  │ Claude works    │  │ Review, commit, │   │
│  │ idea, Claude    │  │ autonomously    │  │ and celebrate   │   │
│  │ creates tasks   │  │ until tests     │  │ your completed  │   │
│  │                 │  │ pass            │  │ feature         │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                    │
│               [Get Started]                  [I know what I'm doing →]│
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Project Detection

### Detection Logic

```typescript
interface ProjectDetection {
  type: ProjectType;
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | null;
  framework: string | null;
  testRunner: string | null;
  linter: string | null;
  typescript: boolean;
  existingPokeralph: boolean;
}

type ProjectType =
  | "bun"
  | "node"
  | "python"
  | "go"
  | "rust"
  | "unknown";

async function detectProject(workingDir: string): Promise<ProjectDetection> {
  const detection: ProjectDetection = {
    type: "unknown",
    packageManager: null,
    framework: null,
    testRunner: null,
    linter: null,
    typescript: false,
    existingPokeralph: false,
  };

  // Check for existing .pokeralph
  detection.existingPokeralph = await exists(path.join(workingDir, ".pokeralph"));

  // Check package.json
  const packageJsonPath = path.join(workingDir, "package.json");
  if (await exists(packageJsonPath)) {
    const pkg = await readJson(packageJsonPath);

    // Detect package manager
    // Check for both bun.lockb (binary) and bun.lock (text, newer versions)
    if (await exists(path.join(workingDir, "bun.lockb")) ||
        await exists(path.join(workingDir, "bun.lock"))) {
      detection.packageManager = "bun";
      detection.type = "bun";
    } else if (await exists(path.join(workingDir, "pnpm-lock.yaml"))) {
      detection.packageManager = "pnpm";
      detection.type = "node";
    } else if (await exists(path.join(workingDir, "yarn.lock"))) {
      detection.packageManager = "yarn";
      detection.type = "node";
    } else {
      detection.packageManager = "npm";
      detection.type = "node";
    }

    // Detect TypeScript
    detection.typescript = !!(
      pkg.devDependencies?.typescript ||
      pkg.dependencies?.typescript ||
      await exists(path.join(workingDir, "tsconfig.json"))
    );

    // Detect framework
    detection.framework = detectFramework(pkg);

    // Detect test runner
    detection.testRunner = detectTestRunner(pkg);

    // Detect linter
    detection.linter = detectLinter(pkg);
  }

  // Check for Python project
  if (await exists(path.join(workingDir, "pyproject.toml")) ||
      await exists(path.join(workingDir, "requirements.txt"))) {
    // Clear Node-specific metadata when switching to Python
    clearIncompatibleMetadata(detection, "python");
    detection.type = "python";
  }

  // Check for Go project
  if (await exists(path.join(workingDir, "go.mod"))) {
    // Clear incompatible metadata when switching to Go
    clearIncompatibleMetadata(detection, "go");
    detection.type = "go";
  }

  // Check for Rust project
  if (await exists(path.join(workingDir, "Cargo.toml"))) {
    // Clear incompatible metadata when switching to Rust
    clearIncompatibleMetadata(detection, "rust");
    detection.type = "rust";
  }

  return detection;
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
function clearIncompatibleMetadata(detection: ProjectDetection, targetType: ProjectType): void {
  // Define which fields are specific to Node/Bun ecosystem
  const nodeSpecificFields = ["packageManager", "framework", "testRunner", "linter", "typescript"];

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

function detectFramework(pkg: PackageJson): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps["next"]) return "nextjs";
  if (deps["@remix-run/react"]) return "remix";
  if (deps["nuxt"]) return "nuxt";
  if (deps["vue"]) return "vue";
  if (deps["react"]) return "react";
  if (deps["svelte"]) return "svelte";
  if (deps["hono"]) return "hono";
  if (deps["express"]) return "express";
  if (deps["fastify"]) return "fastify";
  if (deps["nestjs"]) return "nestjs";

  return null;
}

function detectTestRunner(pkg: PackageJson): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps["vitest"]) return "vitest";
  if (deps["jest"]) return "jest";
  if (deps["mocha"]) return "mocha";
  if (deps["ava"]) return "ava";
  if (pkg.scripts?.test?.includes("bun test")) return "bun:test";

  return null;
}

function detectLinter(pkg: PackageJson): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps["@biomejs/biome"]) return "biome";
  if (deps["eslint"]) return "eslint";
  if (deps["rome"]) return "rome";

  return null;
}
```

### Detection UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Project Detection                                         Step 1/3 │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  Scanning your project...                                          │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ✓ Detected Project Type: Bun/Node.js                        │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ 📦 Package Manager: Bun                                     │ │
│  │ ⚛️  Framework:       React                                   │ │
│  │ 🧪 Test Runner:     Bun Test                                │ │
│  │ 🔍 Linter:          Biome                                   │ │
│  │ 📘 TypeScript:      Yes                                     │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Suggested Feedback Loops                                     │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ ✓ test:      bun test                                       │ │
│  │ ✓ lint:      bun run lint                                   │ │
│  │ ✓ typecheck: bun run typecheck                              │ │
│  │                                                              │ │
│  │ These look correct for your project.                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                      [Back]        [Customize]      [Continue →]  │
└────────────────────────────────────────────────────────────────────┘
```

### Unknown Project Type UI

When project type cannot be detected, show guidance instead of proceeding with unsafe defaults:

```
┌────────────────────────────────────────────────────────────────────┐
│  Project Detection                                         Step 1/3 │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ⚠ Project Type Not Detected                                   │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ We couldn't automatically detect your project type.          │ │
│  │ For safety, we've applied conservative defaults:             │ │
│  │                                                              │ │
│  │ • No feedback loops - configure manually                     │ │
│  │ • Auto-commit disabled - changes won't be committed          │ │
│  │ • HITL mode enabled - review each iteration                  │ │
│  │                                                              │ │
│  │ This ensures Claude doesn't run commands that don't exist    │ │
│  │ or commit changes unexpectedly.                              │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ What would you like to do?                                    │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ ◉ Quick Configure (Recommended)                              │ │
│  │   Set up feedback loops and project settings                 │ │
│  │                                                              │ │
│  │ ○ Select Project Type                                        │ │
│  │   Manually choose from Bun, Node, Python, Go, or Rust        │ │
│  │                                                              │ │
│  │ ○ Continue with Defaults                                     │ │
│  │   Proceed without feedback loops (not recommended)           │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                      [Back]                         [Continue →]  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Wizard

### Default Configuration by Project Type

```typescript
const PROJECT_DEFAULTS: Record<ProjectType, Partial<Config>> = {
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
    autoCommit: false,  // Disabled by default for unknown projects to prevent accidental commits
  },
};

/**
 * Explanation for "unknown" project type defaults.
 * Displayed in UI to help users understand why settings are conservative.
 */
const UNKNOWN_PROJECT_EXPLANATION = {
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

/**
 * Check if project has unknown type with low-trust defaults
 */
function hasLowTrustDefaults(detection: ProjectDetection): boolean {
  return detection.type === "unknown" ||
    (detection.feedbackLoops?.length ?? 0) === 0;
}

/**
 * Get the appropriate explanation and actions for current detection state
 */
function getDetectionGuidance(detection: ProjectDetection): typeof UNKNOWN_PROJECT_EXPLANATION | null {
  if (detection.type === "unknown") {
    return UNKNOWN_PROJECT_EXPLANATION;
  }
  return null;
}
```

### Wizard UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Configuration                                             Step 2/3 │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  Let's set up how PokéRalph will run battles.                     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Execution Mode                                                │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ ◉ HITL (Human in the Loop) - Recommended for beginners      │ │
│  │   Pause after each iteration for your approval               │ │
│  │                                                              │ │
│  │ ○ YOLO (Full Auto)                                          │ │
│  │   Run until completion without pausing                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Feedback Loops                                                │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ Commands to run after each iteration:                        │ │
│  │                                                              │ │
│  │ [✓] test:      [bun test_________________________]          │ │
│  │ [✓] lint:      [bun run lint_____________________]          │ │
│  │ [✓] typecheck: [bun run typecheck________________]          │ │
│  │                                                              │ │
│  │ [+ Add another loop]                                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Limits                                                        │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ Max iterations per task: [10_____]                          │ │
│  │ Timeout per iteration:   [30_____] minutes                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                             [Back]                  [Continue →]  │
└────────────────────────────────────────────────────────────────────┘
```

---

## First PRD Guidance

### Guidance UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Create Your First PRD                                     Step 3/3 │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  A PRD (Product Requirements Document) describes what you want    │
│  to build. Claude will turn it into tasks you can battle!         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Choose how to start:                                          │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ ◉ Start from a template                                      │ │
│  │   Choose a project type for suggested structure              │ │
│  │                                                              │ │
│  │ ○ Describe my own idea                                       │ │
│  │   Start with a blank canvas                                  │ │
│  │                                                              │ │
│  │ ○ Skip for now                                               │ │
│  │   Go to dashboard, create PRD later                          │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Tips for a good PRD:                                          │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ ✓ Be specific about what you want to build                   │ │
│  │ ✓ Include acceptance criteria for success                    │ │
│  │ ✓ Break large features into smaller tasks                    │ │
│  │ ✓ Mention technologies/patterns you want to use              │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                             [Back]              [Start Planning →] │
└────────────────────────────────────────────────────────────────────┘
```

### Template Selection

```
┌────────────────────────────────────────────────────────────────────┐
│  Choose a Template                                                  │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ 🌐 Web App      │  │ 🔌 REST API     │  │ 📱 Mobile App   │   │
│  │                 │  │                 │  │                 │   │
│  │ Frontend app    │  │ Backend API     │  │ React Native    │   │
│  │ with React,     │  │ with CRUD,      │  │ or Expo app     │   │
│  │ routing, state  │  │ auth, database  │  │                 │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ 🛠️  CLI Tool     │  │ 📦 Library      │  │ 🧪 Test Suite   │   │
│  │                 │  │                 │  │                 │   │
│  │ Command-line    │  │ NPM package,    │  │ Add tests to    │   │
│  │ utility with    │  │ reusable code   │  │ existing code   │   │
│  │ arguments       │  │                 │  │                 │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ 🔧 Refactor     │  │ 🐛 Bug Fix      │  │ ✨ New Feature  │   │
│  │                 │  │                 │  │                 │   │
│  │ Clean up and    │  │ Investigate     │  │ Add feature to  │   │
│  │ improve code    │  │ and fix bugs    │  │ existing app    │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                    │
│                            [Back]               [Select Template]  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Onboarding Completion

### Success Screen

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│                      🎉 You're All Set!                           │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │  PokéRalph is configured and ready to go!                   │ │
│  │                                                              │ │
│  │  Configuration saved to:                                     │ │
│  │  .pokeralph/config.json                                     │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Quick Tips:                                                   │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ • Click "New Plan" to start planning a project              │ │
│  │ • After planning, click "Start Battle" on any task          │ │
│  │ • In HITL mode, review each iteration before continuing     │ │
│  │ • Check Settings to adjust configuration anytime            │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                         [Go to Dashboard →]                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Returning User Detection

### Existing Config Found

```
┌────────────────────────────────────────────────────────────────────┐
│  Welcome Back!                                                      │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  Found existing PokéRalph configuration.                          │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Current Configuration                                         │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ Mode:           HITL                                         │ │
│  │ Max Iterations: 10                                           │ │
│  │ Feedback Loops: test, lint, typecheck                        │ │
│  │ Auto-Commit:    Enabled                                      │ │
│  │                                                              │ │
│  │ PRD:            3 tasks (1 completed, 2 pending)             │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│       [Start Fresh]                              [Continue →]     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## API Specification

### POST /api/onboarding/detect

Detect project type and suggest configuration.

**Response:**
```typescript
interface DetectionResponse {
  detection: ProjectDetection;
  suggestedConfig: Config;
}
```

---

### POST /api/onboarding/complete

Mark onboarding as complete and save configuration.

**Request:**
```typescript
interface CompleteOnboardingRequest {
  config: Config;
  skipFirstPRD: boolean;
}
```

**Response:**
```typescript
interface CompleteOnboardingResponse {
  success: boolean;
  configPath: string;
}
```

---

### GET /api/onboarding/status

Check onboarding status.

**Response:**
```typescript
interface OnboardingStatus {
  completed: boolean;
  existingConfig: boolean;
  existingPRD: boolean;
}
```

---

## Error Handling

### Detection Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| Not a project | No package.json etc | "No project detected in this directory" | Change directory |
| Permissions | Can't read files | "Unable to read project files" | Check permissions |
| Unknown type | Unrecognized project | "Project type not recognized" | Manual config |

### Configuration Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| Invalid loop | Command not found | "Command 'X' not found" | Fix command |
| Write failed | Permissions | "Could not save configuration" | Check permissions |

---

## Testing Requirements

### Unit Tests
- [ ] Project detection identifies all supported types
- [ ] Default config generation works for all types
- [ ] Config validation catches invalid values

### Integration Tests
- [ ] Full onboarding flow completes
- [ ] Config persists correctly
- [ ] Detection works in various project structures

### E2E Tests
- [ ] New user sees welcome screen
- [ ] Returning user skips to dashboard
- [ ] Templates work correctly

---

## Accessibility Requirements

### Keyboard Navigation
- Tab through wizard steps
- Enter to proceed
- Escape to go back
- Arrow keys for radio buttons

### Screen Reader Support
- Step progress announced
- Form fields labeled
- Errors announced immediately

### Visual
- High contrast text
- Clear step indicators
- Error states visible

---

## Open Questions

1. **Should we support importing config from another project?**
2. **Should we track onboarding completion analytics?**
3. **Should we show a video tutorial option?**
4. **Should we support team config sharing?**
