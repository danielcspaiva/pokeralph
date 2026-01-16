# Flow 2: Planning User Journey

> Complete documentation of the user journey through the Planning flow in PokéRalph.

## Overview

Flow 2 transforms a user's idea into a structured PRD (Product Requirements Document) with actionable tasks through an interactive conversation with Claude. This is the foundation for all subsequent battle operations.

## Prerequisites

- PokéRalph server running (`bun run dev`)
- Claude CLI installed and authenticated
- Valid working directory selected

## Stages

The Planning view (`/planning`) has 4 stages, managed by the `PlanningStage` type:

```
input → conversation → review → confirm
```

### Stage 1: Input (Describe Idea)

**UI Component:** `IdeaInput`

**User Actions:**
1. Navigate to Planning view (via Dashboard "Start Planning" or sidebar)
2. Enter project idea in textarea
3. Click "Start Planning" button

**What Happens:**
- `handleStartPlanning()` is called
- User's idea is sent to `POST /api/planning/start`
- WebSocket connection receives `planning_output` events as Claude responds
- Stage transitions to "conversation"

**Visual Indicators:**
- Progress step 1 is active (highlighted)
- Submit button shows "Starting..." spinner while loading

### Stage 2: Conversation (Plan with Claude)

**UI Component:** `Conversation`

**User Actions:**
1. Observe Claude's responses appearing in the chat
2. When Claude asks questions, enter answers in the input field
3. Click send button or press Enter to submit
4. Repeat Q&A until satisfied with the PRD
5. Click "Finish Planning" when ready

**What Happens:**
- Claude's output streams via WebSocket `planning_output` events
- Questions detected via `planning_question` events trigger `waiting_input` state
- Answers sent via `POST /api/planning/answer`
- User can finish early by clicking "Finish Planning"

**Visual Indicators:**
- Progress step 2 is active
- "Claude is thinking..." spinner when processing
- Question card appears when Claude asks something
- Chat messages show timestamp and sender (Claude/You)

**Key Controls:**
- **Cancel:** Resets planning session, returns to input
- **Finish Planning:** Extracts PRD from conversation, moves to review

### Stage 3: Review (Review & Confirm)

**UI Component:** `Review`

**User Actions:**
1. Review Overview tab - edit project name and description
2. Switch to Tasks tab - see generated tasks
3. Edit task titles, descriptions, priorities
4. Click "Confirm & Start" to save

**What Happens:**
- PRD data from `finishPlanning()` is displayed
- Edits update local state via `handlePRDEdit()`
- Confirmation sends PRD via `PUT /api/prd`

**Visual Indicators:**
- Progress step 3 is active
- Tabs for Overview and Tasks views
- Task count badge on Tasks tab
- Editable fields throughout

**Key Controls:**
- **Back:** Returns to conversation stage
- **Confirm & Start:** Saves PRD and navigates to Dashboard

### Stage 4: Confirm (Transition)

This is a transient state during save operation. The UI shows the Review stage with a loading spinner on the "Confirm & Start" button.

## State Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Planning State Machine                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    startPlanning()    ┌───────────┐                   │
│  │   idle   │ ─────────────────────→│  planning │                   │
│  └──────────┘                        └─────┬─────┘                   │
│       ↑                                    │                         │
│       │                           detectQuestion()                   │
│  reset()                                   │                         │
│       │                                    ↓                         │
│       │                          ┌─────────────────┐                │
│       ├──────────────────────────│  waiting_input  │                │
│       │                          └────────┬────────┘                │
│       │                                   │                         │
│       │                          answerQuestion()                   │
│       │                                   │                         │
│       │                                   ↓                         │
│       │                          ┌───────────┐                      │
│       │                          │  planning │ (loops back)         │
│       │                          └─────┬─────┘                      │
│       │                                │                            │
│       │                       finishPlanning()                      │
│       │                                │                            │
│       │                                ↓                            │
│       │                          ┌───────────┐                      │
│       └──────────────────────────│ completed │                      │
│                                  └───────────┘                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## API Calls

| Stage | Action | Endpoint | Purpose |
|-------|--------|----------|---------|
| Input | Submit idea | POST /api/planning/start | Start Claude session |
| Conversation | Send answer | POST /api/planning/answer | Continue conversation |
| Conversation | Finish | POST /api/planning/finish | Extract PRD |
| Conversation | Cancel | POST /api/planning/reset | Reset session |
| Review | Check status | GET /api/planning/status | Restore session state |
| Review | Save PRD | PUT /api/prd | Persist final PRD |

## WebSocket Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `planning_output` | Server → Client | Stream Claude's response text |
| `planning_question` | Server → Client | Signal Claude is waiting for input |
| `planning_completed` | Server → Client | Signal PRD is ready |

## Test Status

From TESTING.md:

| Step | Description | Status |
|------|-------------|--------|
| 1 | Navigate to Planning view | PASS |
| 2 | Enter project idea in textarea | PASS |
| 3 | Click "Start Planning" | PASS |
| 4 | Observe Claude's response | PASS |
| 5 | Answer Claude's clarifying question | PASS |
| 6 | Repeat Q&A until Claude is satisfied | PASS |
| 7 | Click "Finish Planning" | PASS |
| 8 | Review Overview tab | Untested |
| 9 | Switch to Tasks tab | Untested |
| 10 | Edit a task title | Untested |
| 11 | Click "Confirm & Start" | Untested |

## Error Scenarios

1. **HTTP Timeout:** 5-minute timeout for Claude operations (may need extension for complex ideas)
2. **No PRD Generated:** Claude didn't produce valid JSON - user sees parse error
3. **Session Lost:** Page reload during conversation - state restored from server
4. **WebSocket Disconnect:** Auto-reconnects, but may miss output during gap
