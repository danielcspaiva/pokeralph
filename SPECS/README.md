# PokéRalph Specifications

This folder contains ultra-detailed specifications for all major features of PokéRalph. These specs serve as the source of truth for implementation, enabling agents to execute with confidence.

## Overview

PokéRalph is an autonomous development orchestrator that runs Claude Code in loops (Ralph technique). It transforms autonomous development into a gamified experience where each task is a "battle".

## Architecture

```
Frontend (React SPA)          Backend (Hono Server)           Core (Pure Logic)
┌────────────────────┐        ┌────────────────────┐        ┌────────────────────┐
│    Web Package     │  HTTP  │   Server Package   │imports │   Core Package     │
│   React + Zustand  │◄──────►│    Hono REST       │◄───────│   Orchestrator     │
│   Vite + Router    │   WS   │    WebSocket       │        │   Services         │
└────────────────────┘        └────────────────────┘        └────────────────────┘
```

## Specifications Index

### Foundation
| Spec | Description | Status |
|------|-------------|--------|
| [01-data-model.md](./01-data-model.md) | Domain entities, relationships, persistence | Complete |
| [07-websocket.md](./07-websocket.md) | Real-time events, keepalive, reconnection | Complete |
| [08-repositories.md](./08-repositories.md) | Repository selection, .pokeralph folder | Complete |

### Features
| Spec | Description | Status |
|------|-------------|--------|
| [02-planning.md](./02-planning.md) | Interactive PRD creation with Claude Q&A | Complete |
| [03-battles.md](./03-battles.md) | Autonomous task execution (Battle Loop) | Complete |
| [04-dashboard.md](./04-dashboard.md) | Task overview and management | Complete |
| [05-history.md](./05-history.md) | Battle iteration timeline view | Complete |
| [06-configuration.md](./06-configuration.md) | HITL/YOLO mode, feedback loops | Complete |

### User Experience
| Spec | Description | Status |
|------|-------------|--------|
| [09-onboarding.md](./09-onboarding.md) | First-run experience, project detection | Complete |
| [10-preflight.md](./10-preflight.md) | Pre-battle validation and checks | Complete |
| [11-recovery.md](./11-recovery.md) | Failed battle resume, rollback strategies | Complete |

## Reading Order

For a complete understanding, read in this order:
1. **01-data-model.md** - Foundation: understand the entities first
2. **08-repositories.md** - How projects are selected and initialized
3. **09-onboarding.md** - First-run experience and setup
4. **06-configuration.md** - Configuration that affects all operations
5. **02-planning.md** - Creating PRDs and tasks
6. **10-preflight.md** - Pre-battle validation checks
7. **03-battles.md** - Core battle loop execution
8. **11-recovery.md** - Handling failures and recovery
9. **07-websocket.md** - Real-time communication layer
10. **04-dashboard.md** - Task management UI
11. **05-history.md** - Viewing battle history

## Spec Document Structure

Each specification follows this structure:

### Core Sections
1. **Purpose** - What this feature does and why it exists
2. **User Stories** - Who uses it, what they want, acceptance criteria
3. **Current Behavior** - How it works today, including known issues

### Technical Detail Sections
4. **State Machine** - Mermaid diagram of all states and transitions
5. **Sequence Diagrams** - Step-by-step interaction flows
6. **Data Model** - Entities, fields, validation rules, persistence
7. **API Specification** - Full endpoint schemas (request/response)
8. **Event Specification** - WebSocket events with payload schemas
9. **UI Requirements** - Components, states, interactions

### Reliability Sections
10. **Error Handling** - Every failure mode and recovery strategy
11. **Edge Cases** - Race conditions, timeouts, concurrent access
12. **Proposed Improvements** - Fixes for known brittleness issues

### Quality Sections
13. **Testing Requirements** - Unit tests, integration tests, E2E scenarios
14. **Performance Considerations** - Latency, polling, timeouts
15. **Open Questions** - Unresolved decisions needing input

## Known Issues (Current State)

These issues are documented within the relevant specs:

| Issue | Spec | Section |
|-------|------|---------|
| Race conditions in planning state transitions | 02-planning.md | Edge Cases |
| Fire-and-forget battle start swallows errors | 03-battles.md | Error Handling |
| WebSocket timeout mismatch (600s timeout, 30s keepalive) | 07-websocket.md | Edge Cases |
| No concurrent battle prevention | 03-battles.md | Edge Cases |
| Polling-based architecture (2s latency) | 03-battles.md | Performance |
| No progress state validation | 03-battles.md | Edge Cases |
| Fixed 5-minute feedback timeout | 03-battles.md | Edge Cases |
| Planning errors with malformed JSON | 02-planning.md | Error Handling |
| Battle history not incremental | 03-battles.md | Performance |
| Status overlap across types | 01-data-model.md | Edge Cases |

## Analytics Event Schema

PokéRalph emits analytics events for metrics tracking. Each event follows a common structure:

```typescript
interface AnalyticsEvent {
  type: string;          // Event type identifier
  timestamp: string;     // ISO 8601 timestamp
  sessionId?: string;    // Optional session correlation
  [key: string]: unknown; // Event-specific payload
}
```

### Event Categories

| Category | Events | Spec Reference |
|----------|--------|----------------|
| **Preflight** | `preflight_started`, `preflight_completed`, `preflight_check_failed`, `preflight_fix_applied`, `preflight_stash_created`, `preflight_stash_restored`, `dry_run_requested` | [10-preflight.md#analytics-events](./10-preflight.md#analytics-events) |
| **Battle** | `battle_start`, `iteration_start`, `iteration_end`, `completion_detected`, `feedback_result`, `battle_complete`, `battle_failed` | [03-battles.md#event-specification](./03-battles.md#event-specification) |
| **Recovery** | `resume_attempt`, `rollback_performed`, `manual_fix_started`, `manual_fix_completed` | [11-recovery.md](./11-recovery.md) |
| **Onboarding** | `project_detected`, `config_saved`, `onboarding_completed` | [09-onboarding.md](./09-onboarding.md) |

### Common Event Types

```typescript
// Union type of all analytics events
type PokéRalphAnalyticsEvent =
  // Preflight events (see 10-preflight.md for full definitions)
  | PreflightAnalyticsEvent

  // Battle events
  | BattleStartEvent
  | IterationStartEvent
  | IterationEndEvent
  | CompletionDetectedEvent
  | FeedbackResultEvent
  | BattleCompleteEvent
  | BattleFailedEvent

  // Recovery events
  | ResumeAttemptEvent
  | RollbackPerformedEvent
  | ManualFixStartedEvent
  | ManualFixCompletedEvent;
```

### Implementing Analytics

Events can be collected via:
1. **WebSocket** - Real-time events during battles
2. **API Endpoints** - Aggregate metrics endpoints
3. **File Logs** - Append-only event logs in `.pokeralph/analytics/`

---

## Success Metrics

Track these metrics to measure PokéRalph effectiveness:

### Planning Metrics
| Metric | Target | Description |
|--------|--------|-------------|
| Time to first PRD | < 10 min | From idea input to PRD generation |
| Q&A turns per PRD | 2-4 turns | Number of clarifying questions |
| PRD parse success rate | > 95% | PRDs successfully extracted |
| Task count per PRD | 3-10 tasks | Appropriately scoped projects |

### Battle Metrics
| Metric | Target | Description |
|--------|--------|-------------|
| Battle start success rate | > 99% | Battles that start without error |
| Preflight pass rate | > 95% | Preflight checks passing |
| Iteration success rate | > 80% | Iterations with all feedback passing |
| Average loops per task | 3-5 | Iterations to completion |
| Completion sigil detection | > 99% | Sigils correctly detected |

### User Experience Metrics
| Metric | Target | Description |
|--------|--------|-------------|
| HITL override rate | < 20% | Users rejecting HITL iterations |
| Feedback loop skip rate | < 10% | Users disabling loops |
| Config change frequency | < 1/week | Stable configuration |
| Recovery success rate | > 80% | Failed battles successfully resumed |

### System Health Metrics
| Metric | Target | Description |
|--------|--------|-------------|
| WebSocket uptime | > 99.9% | Connection availability |
| Reconnection success | > 95% | Auto-reconnects succeeding |
| API response time | < 200ms | p95 latency |
| Battle history load time | < 1s | Large history loading |

## Contributing

When modifying these specs:
1. Update the relevant spec file
2. Update the README if adding new specs
3. Cross-reference related specs when adding dependencies
4. Document new edge cases discovered during implementation
