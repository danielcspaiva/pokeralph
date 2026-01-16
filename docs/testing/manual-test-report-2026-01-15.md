# PokéRalph Manual Testing Report

**Date**: 2026-01-15
**Tester**: Claude Code (browser automation)
**Environment**: macOS, Bun, localhost:5173 (web) + localhost:3456 (server)

## Summary

Manual browser testing identified several bugs in the planning workflow. All bugs have been fixed and verified.

## Bugs Found & Fixed

### 1. Invalid Claude CLI Flag (FIXED)

**File**: `packages/core/src/services/claude-bridge.ts:164`

**Issue**: Used `--plan` flag which doesn't exist in Claude CLI.

**Error**: `error: unknown option '--plan'`

**Fix**: Changed to `--permission-mode plan`

```diff
- args.push("--plan");
+ args.push("--permission-mode", "plan");
```

### 2. WebSocket Never Initialized (FIXED)

**File**: `packages/web/src/components/Layout.tsx`

**Issue**: The WebSocket connection was never established. Neither `App.tsx`, `main.tsx`, nor `Layout.tsx` called `connect()` or `setupWebSocketListeners()`.

**Symptom**: Header showed "Disconnected" permanently, no real-time updates worked.

**Fix**: Added WebSocket initialization to Layout.tsx:

```typescript
import { connect, setupWebSocketListeners } from "@/stores";

useEffect(() => {
  connect();
  const cleanup = setupWebSocketListeners();
  return () => cleanup();
}, []);
```

Also added export in `stores/index.ts`:
```typescript
export { connect } from "@/api/websocket.ts";
```

### 3. Question Detection Regex Fails (FIXED)

**File**: `packages/core/src/services/plan-service.ts:568-581`

**Issue**: The `detectQuestion()` method failed to detect questions when Claude uses bold markdown formatting.

**Claude's actual output**:
```
I have a few clarifying questions to help shape this todo list app:

**1. Platform** - What platform are you targeting?
```

**Root Cause**: Regex patterns didn't account for markdown bold markers (`**`) around numbers and question words.

**Fix**: Updated regex patterns to handle markdown formatting:

```typescript
const questionPatterns = [
  // Direct questions (with optional markdown bold around question word)
  /(?:^|\n)\**(?:What|How|Which|Could you|Can you|Would you|Do you|Does|Is|Are|Should|Will)\**[^?]*\?/gm,
  // Questions with follow-up
  /(?:I'd like to know|I need to understand|Could you clarify|Please tell me|Can you specify)[^?]*\?/gm,
  // Numbered questions with optional markdown bold (e.g., **1.** or 1.)
  /(?:^|\n)\**\d+\.\**\s*[^?]*\?/gm,
  // Any line containing a question mark after a dash or colon (common Claude formatting)
  /(?:^|\n)[^?\n]*[-:]\s*[^?\n]*\?/gm,
];
```

### 4. Planning Output Not Rendering in UI (FIXED)

**File**: `packages/web/src/views/Planning.tsx`

**Issue**: Even though WebSocket receives `planning_output` event and state updates, Claude's messages didn't appear in the UI.

**Root Cause**: Race condition in `handleStartPlanning`:
1. API call starts, Claude processes and sends `planning_output` via WebSocket
2. useEffect adds Claude message to `messages` state
3. API returns, `setMessages([{type: "user"...}])` **overwrites** the Claude message!

**Fix**: Moved user message addition BEFORE the API call:

```typescript
const handleStartPlanning = async (idea: string) => {
  setIsLoading(true);
  setError(null);

  // Add user message BEFORE API call to avoid race condition
  setMessages([{ type: "user", content: idea, timestamp: new Date() }]);
  processedOutputsRef.current.clear(); // Reset for new session

  // Move to conversation stage immediately for better UX
  setStage("conversation");
  setPlanningState("planning");

  try {
    await startPlanning(idea);
    // Note: Claude's response will arrive via WebSocket and be handled by useEffect
  } catch (err) {
    // Reset to input stage on error
    setStage("input");
    setMessages([]);
    setPlanningState("idle");
  } finally {
    setIsLoading(false);
  }
};
```

Also improved the useEffect for syncing WebSocket output to messages:
- Added `processedOutputsRef` to track which outputs have been rendered
- Prevents duplicate messages on re-renders

### 5. WebSocket Connection Timeout (FIXED)

**File**: `packages/server/src/websocket/index.ts:103-104`

**Issue**: WebSocket had 45-second timeout for heartbeat responses, but Claude responses can take 20-30+ seconds. During long responses, the heartbeat wasn't processed, causing connection timeout.

**Fix**: Increased timeout from 45 seconds to 120 seconds:

```diff
- /** Connection timeout in milliseconds (45 seconds without pong) */
- private readonly connectionTimeoutMs = 45000;
+ /** Connection timeout in milliseconds (120 seconds without pong - longer for Claude responses) */
+ private readonly connectionTimeoutMs = 120000;
```

## Logging Added

Strategic logging was added to these files for debugging:

### Server-side
- `packages/server/src/routes/planning.ts` - API request/response logging
- `packages/server/src/websocket/index.ts` - WebSocket broadcast logging
- `packages/core/src/services/plan-service.ts` - State transition and question detection logging

### Client-side
- `packages/web/src/api/client.ts` - HTTP request/response logging
- `packages/web/src/api/websocket.ts` - WebSocket connection and message logging
- `packages/web/src/views/Planning.tsx` - Planning output sync logging

**Log prefix format**: `[PokéRalph][Component] action`

**Example logs**:
```
[PokéRalph][Planning] POST /start {"idea": "A simple todo..."}
[PokéRalph][PlanService] State transition: idle → planning
[PokéRalph][PlanService] detectQuestion - found question {"question": "..."}
[PokéRalph][WebSocket] Broadcasting: planning_output {"clientCount": 2, ...}
[PokéRalph][WS] Received: planning_output {output: "I have..."}
[PokéRalph][Planning] Adding new Claude message {preview: "..."}
```

## Test Flow Executed

1. **Dashboard (empty state)** - PASSED
   - Shows "No Project Yet" with "Start Planning" CTA

2. **Navigate to Planning** - PASSED
   - Shows "Describe Your Idea" stage with text input

3. **Start Planning** - PASSED
   - API call succeeds ✓
   - Claude responds with questions ✓
   - WebSocket receives response ✓
   - Question detection works ✓
   - UI shows Claude's response ✓

4. **Answer Questions** - PASSED
   - User message appears immediately ✓
   - Claude receives answer ✓
   - Follow-up response rendered ✓
   - PRD generation started ✓

5. **Review & Confirm** - NOT TESTED
   - Can be tested in future session

6. **Return to Dashboard** - NOT TESTED
   - Can be tested in future session

## Files Modified During Testing

```
packages/core/src/services/claude-bridge.ts     # Fixed --plan flag
packages/core/src/services/plan-service.ts      # Fixed question detection regex + added logging
packages/server/src/routes/planning.ts          # Added logging
packages/server/src/websocket/index.ts          # Fixed timeout (45s → 120s) + added logging
packages/web/src/api/client.ts                  # Added logging
packages/web/src/api/websocket.ts               # Added logging
packages/web/src/components/Layout.tsx          # Fixed WebSocket init
packages/web/src/stores/index.ts                # Added connect export
packages/web/src/views/Planning.tsx             # Fixed race condition + added logging
```

## Remaining Work

### Priority 1 (Nice to have)
1. Add E2E tests for planning workflow
2. Add error boundaries around WebSocket operations
3. Test "Review & Confirm" and "Return to Dashboard" steps
