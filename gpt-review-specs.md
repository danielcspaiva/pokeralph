# GPT Review: PokéRalph Specs (User Flow Improvements)

Scope: review based on `SPECS/README.md` and the core flow specs (planning, battles, dashboard, history, configuration). Goal is to make the user flow more useful, more enjoyable, and less brittle.

## Current Flow (as implied by specs)
1. Planning: user writes an idea -> Claude Q&A -> generate PRD -> user finishes planning.
2. Dashboard: tasks show up -> user selects a task -> chooses HITL or YOLO -> starts a battle.
3. Battle: loop of Claude execution -> feedback loops -> (optional) commit -> HITL approval.
4. History: review iterations and outputs -> continue to next task.
5. Configuration: sets global behavior (mode, loops, timeouts, auto-commit).

## Core Frictions and Brittleness Risks
- Planning requires a manual "Finish Planning" action and relies on parsing unstructured output; users may be unsure when to finish, and failures on malformed JSON are likely.
- Battle completion depends on a text sigil and polling; this is fragile under partial output, truncated logs, or buffering issues.
- Start battle is described as fire-and-forget; errors can be swallowed, and the user does not get a clear failure surface.
- WebSocket keepalive mismatch and polling-based UI can produce stale or contradictory state across dashboard, battle view, and history.
- No concurrent battle prevention is both a UX trap and a data integrity risk (state overlap and racing updates).
- History data is not incremental; long-running battles or large outputs will be brittle to load and inspect.
- Configuration is global and can be invalid for specific tasks; loops and timeouts are not adaptive to task complexity or repo size.

## Recommendations (Prioritized)

### 1) Make planning feel guided and deterministic (usefulness + enjoyment)
- Turn planning into a clear stepper: Idea -> Q&A -> Draft PRD -> Review/Edit -> Tasks Ready.
- Auto-save draft PRD after every Q&A turn, and show a "Completeness" checklist (missing fields or acceptance criteria).
- Allow inline editing of tasks and acceptance criteria before finishing; avoid forcing the user into a separate editor.
- Provide templates or starter prompts per project type (api, frontend, infra) to reduce initial uncertainty.
- If JSON parse fails, fall back to a human-editable PRD view and show specific parsing errors.

### 2) Add a preflight stage before battle start (usefulness + resilience)
- Run a quick preflight check: repo clean status, feedback loop availability, config validity, and estimated runtime.
- Show a "battle preview" (task summary, loops to be run, commit behavior, timeouts).
- Add a "dry run" option: generate plan/patch without applying, to build user trust.

### 3) Improve in-battle feedback and control (enjoyment + trust)
- Display an iteration summary with diff preview, top files touched, and failed feedback details.
- Provide explicit controls: "pause", "resume", "retry iteration", and "continue after manual fix".
- In HITL mode, show a short decision card (summary + risks + evidence) instead of raw logs first.
- For YOLO mode, add a completion toast and "start next task" suggestion to keep momentum.

### 4) Make feedback loops flexible and user-friendly (usefulness + less brittleness)
- Allow per-task overrides for feedback loops and timeouts (useful for heavy or non-testable tasks).
- Support re-running only failing loops rather than re-running all loops.
- Allow conditional pass with a rationale to avoid a full stop on a low-priority failure.

### 5) Make task management smarter (usefulness + enjoyment)
- Recommend the next task based on priority + dependency + risk score.
- Add a task queue (battle backlog) for YOLO-friendly tasks, with explicit single-battle execution to avoid conflicts.
- Offer a "one-click" path: pick task -> choose mode -> preflight -> start.

### 6) Improve history into a learning tool (enjoyment + usefulness)
- Summarize each iteration into a short "what changed + why" note for quick scanning.
- Provide "fork from iteration" to resume a battle with a specific checkpoint.
- Make history incremental and streamable to avoid loading full output at once.

### 7) Hardening the flow to reduce brittleness (reliability)
- Replace the completion sigil with a structured protocol (e.g., JSON block or tool call) and enforce schema validation.
- Make state transitions idempotent and server-authoritative; return clear errors instead of silent failures.
- On reconnect or refresh, always resync from server state to avoid UI drift.
- Add concurrency guards: explicit "battle in progress" errors and queued execution.
- Validate and version PRD schema; tolerate partial data and surface errors inline.

## Spec-Level Additions Worth Creating
- Onboarding and first-run flow (project detection, config defaults, first PRD).
- Battle preflight spec (checks, UI outcomes, failure paths).
- Recovery flows (failed battle resume, manual fix + continue, and rollback).
- Event consistency spec (WS reconnect and snapshot strategy).

## Metrics to Validate Improvements
- Time to first successful PRD.
- Planning Q&A turns until completion.
- Battle start failure rate and reason categories.
- Iteration success rate and avg loops per task.
- User overrides in feedback loops and HITL approvals.
