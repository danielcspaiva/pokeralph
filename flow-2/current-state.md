# Flow 2: Current State Analysis

> Analysis of the current implementation, known issues, and areas needing improvement.

## Test Status Summary

From TESTING.md:
- **Steps 1-7:** PASS - Basic planning flow works
- **Steps 8-11:** Untested - Review and confirm stages

## Previously Fixed Issues

These issues were identified and fixed during initial testing:

| # | Issue | Fix Location | Status |
|---|-------|--------------|--------|
| 4 | Planning state mismatch (pendingQuestion vs waiting_input) | `plan-service.ts`, `planning.ts` | FIXED |
| 5 | API timeout too short for Claude operations | `client.ts:197-216` | FIXED |
| 6 | UI doesn't restore pending question on reload | `Planning.tsx:543-572` | FIXED |
| 7 | UI stuck in conversation when server is idle | `Planning.tsx:564-566` | FIXED |
| 8 | "Finish Planning" disabled during waiting_input | `Planning.tsx:159-160` | FIXED |

## Current Implementation Analysis

### Stage 1-3: Working Well

The conversation stage (steps 1-7) works correctly:
- Claude processes the idea and asks questions
- WebSocket events stream output to UI
- Question detection triggers waiting_input state
- User answers flow back to Claude
- "Finish Planning" extracts PRD successfully

### Stage 4: Review Stage - Needs Testing

The Review stage (`Planning.tsx:248-426`) has not been fully tested. Key areas:

#### Overview Tab
- **Project Name:** Editable via `handleNameChange()`
- **Description:** Editable via `handleDescriptionChange()`
- **Task Count:** Displays `editedPRD.tasks.length`

#### Tasks Tab
- **Task List:** Renders all tasks with editable fields
- **Edit Fields:** Title, priority, description
- **Acceptance Criteria:** Display only (not editable)

### Stage 5: Confirm Stage - Needs Testing

The confirmation flow (`handleConfirm()` at line 672-689) needs verification:
1. Saves PRD via `PUT /api/prd`
2. Updates global store via `setPRD()`
3. Clears planning session
4. Navigates to Dashboard

## Potential Issues

### Issue A: No PRD Readiness Validation (Severity: Medium) - MITIGATED

**Location:** `Planning.tsx:158-161`

**Problem:** The "Finish Planning" button can be clicked as soon as any messages exist in the conversation, but this doesn't guarantee Claude has generated a valid PRD JSON.

**Mitigation Applied:**
- PRD_OUTPUT_SCHEMA now requires `tasks` array with at least 1 item
- Planning prompt explicitly instructs Claude to include tasks
- `parsePRDOutput()` validates tasks exist and have required fields
- Error message is clear: "PRD must contain at least one task"

**Remaining Risk:** User can still click early and get error, but error is now informative.

### Issue B: PRD Parse Error UX (Severity: Medium)

**Location:** `Planning.tsx:634-649`

**Problem:** When PRD parsing fails, the error message is technical and unhelpful.

**Current Behavior:**
```typescript
} catch (err) {
  const message =
    err instanceof Error ? err.message : "Failed to finish planning";
  setError(message);
}
```

**Typical Error:** "Failed to parse PRD from planning output: No JSON found in output"

**Improvement Needed:** Guide user to continue conversation until Claude generates PRD.

### Issue C: HTTP Timeout vs WebSocket Events (Severity: Low)

**Location:** `Planning.tsx:585-608`

**Problem:** When HTTP times out but WebSocket has received output, the timeout is silently ignored. This could mask real issues.

**Current Behavior:**
```typescript
if (hasReceivedOutput || hasQuestion) {
  // Planning is working via WebSocket, ignore the HTTP timeout
  console.log("[Planning] HTTP request timed out but WebSocket shows planning is progressing");
} else {
  // No WebSocket progress, this is a real failure
  // ... reset state
}
```

**Risk:** 5-minute timeout is already very long. If HTTP times out AND WebSocket has output, something unusual is happening that should perhaps be investigated.

### Issue D: Implicit Question Extraction Quality (Severity: Low)

**Location:** `plan-service.ts:616-634`

**Problem:** When implicit question patterns match, the extracted question is often a generic fallback.

**Current Code:**
```typescript
const summaryMatch = lastChunk.match(/(?:Here's what I need to understand|I need to understand|questions)[:\s]*(.*?)(?:\n\n|$)/is);
const question = summaryMatch?.[1]?.trim() || "Claude is asking clarifying questions. Please review the conversation and provide your answers.";
```

**Issue:** The regex often fails to extract the actual question content, falling back to generic text.

### Issue E: WebSocket planning_completed No PRD (Severity: Low)

**Location:** `websocket.ts:205`

**Problem:** The `planning_completed` WebSocket event has an empty payload.

```typescript
planning_completed: Record<string, never>;
```

**Issue:** If the HTTP `finishPlanning()` call times out but WebSocket delivers `planning_completed`, the frontend has no PRD data to display.

**Current Mitigation:** Frontend relies entirely on HTTP response for PRD data.

### Issue F: Review Stage No Server Validation (Severity: Low)

**Location:** `Planning.tsx:667-689`

**Problem:** PRD edits in the Review stage are only validated on the client side before being sent to the server.

**Risk:** Invalid PRD structure could be saved if client-side state becomes corrupted.

### Issue G: Task Breakdown Not Exposed (Severity: Low) - RESOLVED

**Previously:** `breakIntoTasks()` existed in PlanService but had no API endpoint.

**Resolution:**
- Added `POST /api/planning/breakdown` endpoint
- Exposed `breakIntoTasks()` method on Orchestrator
- Added "Refine Tasks with Claude" button in Review stage Tasks tab
- Users can now optionally refine tasks after initial PRD generation

## Code Quality Observations

### Good Patterns

1. **Type Safety:** TypeScript interfaces throughout
2. **State Management:** Clear Zustand store with typed actions
3. **Event Handling:** WebSocket listeners properly cleaned up
4. **Error Boundaries:** Try-catch blocks around async operations
5. **Logging:** Strategic console logs for debugging

### Areas for Improvement

1. **Test Coverage:** No automated tests for Planning view
2. **Loading States:** Could use more granular loading indicators
3. **Error Recovery:** Some errors leave UI in intermediate state
4. **Accessibility:** Form inputs could use better ARIA labels

## Modified Files (from git diff)

The following files have unstaged changes related to Flow 2:

| File | Changes |
|------|---------|
| `packages/core/src/services/plan-service.ts` | Enhanced question detection, state handling |
| `packages/server/src/routes/planning.ts` | Fixed answer endpoint state check |
| `packages/web/src/api/client.ts` | Added CLAUDE_TIMEOUT_MS |
| `packages/web/src/api/websocket.ts` | Added disconnected event handling |
| `packages/web/src/stores/app-store.ts` | Fixed planning state actions |
| `packages/web/src/views/Planning.tsx` | Fixed session restoration, button states |

## Summary

**Working:**
- Basic planning conversation flow (steps 1-7)
- Question detection and answer submission
- PRD extraction when Claude produces valid JSON
- Session restoration on page reload

**Needs Testing:**
- Review stage editing (steps 8-10)
- Confirm and save flow (step 11)
- Edge cases around PRD parsing failures

**Potential Improvements:**
- Add PRD readiness check before enabling "Finish Planning"
- Better error messages for PRD parse failures
- More robust question extraction from Claude output
