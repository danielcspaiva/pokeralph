# Flow 2: Fix Plan

> Prioritized list of improvements and fixes for the Planning flow.

## Priority Levels

- **P0 (Critical):** Blocks core functionality, must fix immediately
- **P1 (High):** Causes poor UX or potential failures, fix soon
- **P2 (Medium):** Quality of life improvements, fix when convenient
- **P3 (Low):** Nice to have, address in future iterations

## Current Status

**MAJOR UPDATE:** PRD-to-Tasks flow has been made robust:
- PRD schema now requires tasks array with at least 1 item
- Planning prompt explicitly instructs Claude to include tasks
- Task validation added to parsePRDOutput()
- New `/api/planning/breakdown` endpoint for task refinement
- "Refine Tasks with Claude" button added to Review stage

Flow 2 steps 1-7 are working. Steps 8-11 need manual testing before we can identify if there are issues.

## Recommended Actions

### Action 1: Complete Manual Testing (P0)

**Priority:** Critical

**Rationale:** Before implementing any fixes, we need to verify the current implementation by completing the manual test checklist.

**Steps:**
1. Run the dev server: `bun run dev`
2. Navigate to http://localhost:5173
3. Complete Flow 2 steps 8-11 from TESTING.md:
   - Step 8: Review Overview tab
   - Step 9: Switch to Tasks tab
   - Step 10: Edit a task title
   - Step 11: Click "Confirm & Start"
4. Document any failures in TESTING.md

**Expected Outcome:** Either all steps pass, or we have specific failures to fix.

---

### Action 2: Add PRD Readiness Check (P1)

**Priority:** High

**File:** `packages/web/src/views/Planning.tsx`

**Problem:** "Finish Planning" button can be clicked before Claude generates PRD JSON.

**Current Code (line 158-161):**
```typescript
<Button
  onClick={onFinish}
  disabled={isProcessing || messages.length === 0}
>
```

**Proposed Fix:**

Option A: Add client-side PRD detection
```typescript
// Add state for PRD readiness
const [hasPRDInOutput, setHasPRDInOutput] = useState(false);

// In useEffect that processes planningOutput
useEffect(() => {
  // ... existing message processing

  // Check if any output contains PRD JSON
  const fullOutput = planningOutput.join('');
  const hasPRD = /```json[\s\S]*?"name"[\s\S]*?"description"[\s\S]*?"tasks"[\s\S]*?```/.test(fullOutput);
  setHasPRDInOutput(hasPRD);
}, [planningOutput]);

// Update button
<Button
  onClick={onFinish}
  disabled={isProcessing || messages.length === 0 || !hasPRDInOutput}
  title={!hasPRDInOutput ? "Wait for Claude to generate PRD" : ""}
>
```

Option B: Server-side readiness endpoint (more robust)
```typescript
// Add to planning routes
router.get("/ready", (c) => {
  const orchestrator = requireOrchestrator();
  const hasValidPRD = orchestrator.hasPRDReady(); // New method
  return c.json({ ready: hasValidPRD });
});
```

**Recommendation:** Implement Option A first (simpler), then consider Option B for robustness.

---

### Action 3: Improve PRD Parse Error UX (P2)

**Priority:** Medium

**File:** `packages/web/src/views/Planning.tsx`

**Problem:** Technical error messages when PRD parsing fails.

**Current Code (line 643-649):**
```typescript
} catch (err) {
  const message =
    err instanceof Error ? err.message : "Failed to finish planning";
  setError(message);
}
```

**Proposed Fix:**
```typescript
} catch (err) {
  const rawMessage = err instanceof Error ? err.message : "Unknown error";

  // Check for common PRD parsing errors
  if (rawMessage.includes("No JSON found") || rawMessage.includes("Failed to parse PRD")) {
    setError(
      "Claude hasn't generated a complete PRD yet. Please continue the conversation " +
      "until Claude provides a JSON document with project name, description, and tasks."
    );
  } else {
    setError(`Planning error: ${rawMessage}`);
  }
}
```

---

### Action 4: Add Visual PRD Generation Indicator (P2)

**Priority:** Medium

**File:** `packages/web/src/views/Planning.tsx`

**Problem:** User doesn't know when Claude has generated the PRD.

**Proposed Fix:** Add a visual indicator when PRD JSON is detected in output.

```typescript
// In Conversation component, add indicator
{hasPRDInOutput && (
  <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-green-500">
    <Check className="h-4 w-4" />
    <span>Claude has generated a PRD. Click "Finish Planning" when ready.</span>
  </div>
)}
```

---

### Action 5: Improve Question Extraction (P3)

**Priority:** Low

**File:** `packages/core/src/services/plan-service.ts`

**Problem:** Implicit question extraction often falls back to generic message.

**Current Code (line 628-631):**
```typescript
const summaryMatch = lastChunk.match(/(?:Here's what I need to understand|I need to understand|questions)[:\s]*(.*?)(?:\n\n|$)/is);
const question = summaryMatch?.[1]?.trim() || "Claude is asking clarifying questions. Please review the conversation and provide your answers.";
```

**Proposed Fix:** Extract numbered questions or bullet points if present.
```typescript
// Try to extract numbered questions
const numberedQuestions = lastChunk.match(/(?:^|\n)\d+\.\s*([^\n?]*\?)/gm);
if (numberedQuestions && numberedQuestions.length > 0) {
  return "Claude has questions:\n" + numberedQuestions.join("\n");
}

// Try to extract bullet points
const bulletPoints = lastChunk.match(/(?:^|\n)[-*]\s*([^\n?]*\?)/gm);
if (bulletPoints && bulletPoints.length > 0) {
  return "Claude has questions:\n" + bulletPoints.join("\n");
}

// Fallback
return "Claude is asking clarifying questions. Please review the conversation and provide your answers.";
```

---

### Action 6: Add Acceptance Criteria Editing (P3)

**Priority:** Low

**File:** `packages/web/src/views/Planning.tsx`

**Problem:** Acceptance criteria are displayed but not editable in Review stage.

**Current Code (line 379-392):**
```typescript
{task.acceptanceCriteria.length > 0 && (
  <div>
    <span className="text-sm font-medium">Acceptance Criteria:</span>
    <ul className="mt-1 list-inside list-disc text-sm">
      {task.acceptanceCriteria.map((criterion, criterionIdx) => (
        <li key={`${task.id}-criterion-${criterionIdx}`}>{criterion}</li>
      ))}
    </ul>
  </div>
)}
```

**Proposed Fix:** Add editing capability with add/remove buttons.

---

### Action 7: Add WebSocket PRD Delivery (P3)

**Priority:** Low

**Problem:** If HTTP finishPlanning() times out, WebSocket has no PRD fallback.

**Files:**
- `packages/core/src/services/plan-service.ts`
- `packages/web/src/api/websocket.ts`
- `packages/web/src/stores/app-store.ts`

**Proposed Fix:**
```typescript
// In PlanService.finishPlanning()
this.emit("planning_completed", { prd }); // Include PRD in payload

// Update WebSocket payload type
planning_completed: { prd: PRD };

// Update app-store handler
const handlePlanningCompleted = (payload, _timestamp) => {
  useAppStore.setState((state) => ({
    planningSession: { ...state.planningSession, state: "completed" },
  }));
  // If we have PRD data from WebSocket, store it as fallback
  if (payload.prd) {
    // Store in temporary location for UI to retrieve if HTTP fails
    useAppStore.setState({ pendingPRD: payload.prd });
  }
};
```

---

## Implementation Order

1. **Immediate:** Complete manual testing (Action 1)
2. **Next Sprint:** PRD readiness check + error UX (Actions 2, 3)
3. **Future:** Visual indicators, question extraction, editing (Actions 4, 5, 6, 7)

## Verification

After implementing fixes:
1. Re-run all Flow 2 steps from TESTING.md
2. Add automated tests for:
   - PRD readiness detection
   - Error message display
   - PRD save/redirect flow
3. Update TESTING.md with new test results
