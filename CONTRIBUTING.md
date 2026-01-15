# Contributing to PokéRalph

Thank you for your interest in contributing to PokéRalph! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Conventions](#code-conventions)
- [Submitting Changes](#submitting-changes)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

Please be respectful and constructive in all interactions. We're building something together!

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Claude Code CLI](https://claude.ai/code) (for testing battle functionality)
- Git

### Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/pokeralph.git
cd pokeralph

# Add upstream remote
git remote add upstream https://github.com/danielcspaiva/pokeralph.git
```

## Development Setup

### Install Dependencies

```bash
bun install
```

### Start Development Server

```bash
bun run dev
```

This starts:
- Server on `http://localhost:3456`
- Web app on `http://localhost:5173`

### Run Tests

```bash
# Run all tests
bun test

# Run tests for a specific package
bun test packages/core/tests/

# Run a specific test file
bun test packages/core/tests/file-manager.test.ts

# Run e2e tests
bun run test:e2e
```

### Type Checking

```bash
bun run typecheck
```

### Linting

```bash
# Check for lint errors
bun run lint

# Format code
bun run format

# Check formatting without changes
bun run format:check
```

## Code Conventions

### General Guidelines

1. **Use Bun APIs**: Prefer Bun-native APIs over Node.js alternatives
   - `Bun.serve()` not `express()`
   - `Bun.file()` not `fs.readFile()`
   - `Bun.spawn()` not `child_process.spawn()`
   - `bun test` not `jest`

2. **TypeScript**: All code must be TypeScript with strict mode enabled

3. **No `any`**: Avoid `any` type. Use `unknown` if the type is truly unknown

4. **Functional over OOP**: Prefer pure functions where practical

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `file-manager.ts` |
| Classes | PascalCase | `FileManager` |
| Functions | camelCase | `loadConfig()` |
| Constants | UPPER_SNAKE_CASE | `MAX_ITERATIONS` |
| Types/Interfaces | PascalCase | `TaskStatus` |
| Test files | `*.test.ts` | `file-manager.test.ts` |

### Code Structure

**Core package (`packages/core`)**:
- `src/types/` - Domain interfaces and types
- `src/services/` - Business logic services
- `src/utils/` - Pure utility functions
- `tests/` - Unit tests

**Server package (`packages/server`)**:
- `src/routes/` - REST API endpoints
- `src/websocket/` - WebSocket handlers
- `src/middleware/` - Hono middleware
- `tests/` - Integration tests

**Web package (`packages/web`)**:
- `src/components/` - Reusable React components
- `src/views/` - Page-level components
- `src/stores/` - Zustand state stores
- `src/api/` - HTTP and WebSocket clients
- `tests/` - Component tests (Vitest)

### Commit Messages

Follow the established format:

```
[PokéRalph] Task XXX: Short description

Longer description if needed.
```

For non-task commits:

```
type(scope): description

- fix: Bug fixes
- feat: New features
- docs: Documentation changes
- refactor: Code refactoring
- test: Adding or updating tests
- chore: Maintenance tasks
```

### Testing Guidelines

1. **Unit tests**: Test individual functions and classes in isolation
2. **Integration tests**: Test API endpoints and service interactions
3. **E2E tests**: Test complete user flows

Test file naming:
- Unit/integration: `packages/{pkg}/tests/{feature}.test.ts`
- E2E: `tests/e2e/{feature}.test.ts`

Example test structure:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("FeatureName", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  test("should do something specific", () => {
    // Arrange
    const input = "test";

    // Act
    const result = doSomething(input);

    // Assert
    expect(result).toBe("expected");
  });
});
```

## Submitting Changes

### Before Submitting

1. **Pull latest changes**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all checks**:
   ```bash
   bun run typecheck
   bun run lint
   bun test
   ```

3. **Ensure no regressions**: All existing tests must pass

### Creating a Pull Request

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit:
   ```bash
   git add .
   git commit -m "feat(scope): add new feature"
   ```

3. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

4. Open a Pull Request on GitHub

## Pull Request Process

1. **Title**: Use a clear, descriptive title
2. **Description**: Explain what changes you made and why
3. **Tests**: Include tests for new functionality
4. **Documentation**: Update docs if behavior changes

### PR Checklist

- [ ] Code follows the style guidelines
- [ ] Tests pass (`bun test`)
- [ ] Type checking passes (`bun run typecheck`)
- [ ] Linting passes (`bun run lint`)
- [ ] Documentation updated if needed
- [ ] Commit messages follow conventions

## Questions?

If you have questions, feel free to:
- Open an issue for discussion
- Start a discussion on GitHub

Thank you for contributing!
