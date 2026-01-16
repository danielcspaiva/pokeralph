# Flow 2: Test Plan

> Manual and automated test scenarios for the Planning flow.

## Prerequisites

Before testing, ensure:
1. Dev server running: `bun run dev`
2. Test repository created (not the pokeralph repo itself):
   ```bash
   mkdir -p /tmp/pokeralph-test-project
   cd /tmp/pokeralph-test-project
   git init
   echo '{"name": "test-project"}' > package.json
   git add . && git commit -m "init"
   ```
3. Browser open at http://localhost:5173
4. Working directory set to test repo via repository selector

## Test Scenarios

### Scenario 1: Happy Path - Complete Planning Flow

**Objective:** Verify the full planning flow from idea to saved PRD.

**Steps:**

| # | Action | Expected Result | Verification |
|---|--------|-----------------|--------------|
| 1 | Navigate to /planning | Progress step 1 active, textarea visible | Visual |
| 2 | Enter "Build a simple todo app with add, delete, and complete features" | Text appears in textarea | Visual |
| 3 | Click "Start Planning" | Button shows spinner, progress step 2 activates | Visual |
| 4 | Wait for Claude response | Message appears in chat area | Check messages.length > 0 |
| 5 | If Claude asks question, enter answer | Answer appears in chat, Claude continues | Visual |
| 6 | Repeat Q&A until Claude outputs PRD | JSON block appears in conversation | Check for ```json``` in output |
| 7 | Click "Finish Planning" | Progress step 3 activates, Review stage appears | Visual |
| 8 | Verify Overview tab | Project name and description editable | Try editing |
| 9 | Click Tasks tab | Task list with priorities visible | Count tasks > 0 |
| 10 | Edit a task title | Title updates immediately | Visual |
| 11 | Click "Confirm & Start" | Spinner, then redirect to Dashboard | Check URL = "/" |
| 12 | Verify PRD saved | Dashboard shows project name and tasks | Check sidebar |

**Browser MCP Commands:**
```
mcp__playwright__browser_navigate: http://localhost:5173/planning
mcp__playwright__browser_snapshot
mcp__playwright__browser_type: [textarea ref] "Build a simple todo app..."
mcp__playwright__browser_click: [Start Planning button ref]
mcp__playwright__browser_wait_for: text="Claude"
```

---

### Scenario 2: Early Finish (Before PRD)

**Objective:** Verify behavior when user clicks "Finish Planning" before Claude generates PRD.

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Start planning with an idea | Claude begins responding |
| 2 | Wait for first Claude message (just questions) | Message appears |
| 3 | Click "Finish Planning" immediately | Error message displayed |
| 4 | Verify error message | Should say PRD not found or similar |
| 5 | Continue conversation | Can still interact |

**Expected Error:** "Failed to finish planning: No JSON found in output" or user-friendly variant.

---

### Scenario 3: Page Reload During Conversation

**Objective:** Verify session restoration after page reload.

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Start planning, wait for Claude's question | Question displayed |
| 2 | Note the pending question text | Record for comparison |
| 3 | Refresh the page (F5) | Page reloads |
| 4 | Wait for app to initialize | Loading completes |
| 5 | Verify stage is "conversation" | Progress step 2 active |
| 6 | Verify pending question restored | Same question displayed |
| 7 | Submit answer | Conversation continues normally |

---

### Scenario 4: Cancel Planning Session

**Objective:** Verify cancel resets state correctly.

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Start planning with an idea | Claude responds |
| 2 | Click "Cancel" button | Confirmation or immediate cancel |
| 3 | Verify return to input stage | Progress step 1 active |
| 4 | Verify textarea is empty | Clean slate |
| 5 | Verify server state reset | GET /api/planning/status returns idle |

---

### Scenario 5: Edit PRD in Review Stage

**Objective:** Verify all editing functions work in Review stage.

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Complete planning to Review stage | Review UI visible |
| 2 | Change project name | Name updates |
| 3 | Change project description | Description updates |
| 4 | Click Tasks tab | Task list visible |
| 5 | Change first task title | Title updates |
| 6 | Change first task priority | Priority updates |
| 7 | Change first task description | Description updates |
| 8 | Click "Confirm & Start" | PRD saved with changes |
| 9 | Verify changes persisted | Reload page, check values |

---

### Scenario 6: Empty Tasks Handling

**Objective:** Verify behavior when PRD has no tasks.

> **Note:** With the new task requirement, this scenario should no longer occur. The PRD validation will reject PRDs without tasks. If Claude fails to generate tasks, an error will be shown: "PRD must contain at least one task".

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Complete planning but Claude generates no tasks | Error: "PRD must contain at least one task" |
| 2 | Continue conversation | Can still interact |
| 3 | Wait for Claude to include tasks | PRD should now pass validation |

---

### Scenario 6b: Refine Tasks with Claude

**Objective:** Verify the Refine Tasks feature works correctly.

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Complete planning to Review stage | Review UI visible with tasks |
| 2 | Click Tasks tab | Task list visible |
| 3 | Note current task count | Record for comparison |
| 4 | Click "Refine Tasks with Claude" button | Button shows "Refining..." spinner |
| 5 | Wait for refinement to complete | Tasks list updates |
| 6 | Verify tasks changed | May have different/more detailed tasks |
| 7 | Click "Confirm & Start" | PRD saved with refined tasks |

---

### Scenario 7: WebSocket Disconnection

**Objective:** Verify handling of WebSocket disconnection during planning.

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Start planning with an idea | Claude begins responding |
| 2 | Stop the server (Ctrl+C) | Server stops |
| 3 | Verify "Offline" indicator | Header shows disconnected |
| 4 | Restart server | Server starts |
| 5 | Verify reconnection | "Connected" indicator |
| 6 | Verify planning state | May need to restart or continue |

---

## Edge Cases

### Edge Case A: Very Long Idea

**Input:** 5000+ character detailed project description
**Expected:** Server accepts, Claude processes (may take longer)

### Edge Case B: Special Characters in Idea

**Input:** Idea with quotes, backticks, HTML-like tags
**Expected:** Proper escaping, no XSS, no JSON parse errors

### Edge Case C: Rapid Button Clicks

**Action:** Double-click "Start Planning" quickly
**Expected:** Only one planning session starts (409 on second)

### Edge Case D: Unicode in PRD

**Setup:** Claude generates PRD with non-ASCII characters
**Expected:** Properly stored and displayed (emoji, Chinese, etc.)

### Edge Case E: HTTP Timeout

**Setup:** Very complex idea that takes > 5 minutes
**Expected:** WebSocket continues receiving, HTTP timeout logged but not fatal

---

## API Verification Commands

Use curl or similar to verify API state:

```bash
# Check planning status
curl http://localhost:3456/api/planning/status

# Expected idle:
# {"state":"idle","pendingQuestion":null,"isPlanning":false}

# Expected during planning:
# {"state":"planning","pendingQuestion":null,"isPlanning":true}

# Expected waiting for input:
# {"state":"waiting_input","pendingQuestion":"What features...","isPlanning":true}

# Refine tasks (requires existing PRD)
curl -X POST http://localhost:3456/api/planning/breakdown

# Expected success:
# {"message":"Tasks refined successfully","tasks":[...],"prd":{...}}

# Expected error (no PRD):
# {"error":"No PRD exists. Complete planning first.","code":"NO_PRD","status":409}
```

---

## Browser Console Checks

Look for these log patterns:

```
[PokéRalph][API] POST /api/planning/start {...}
[PokéRalph][WS] Received: planning_output {...}
[PokéRalph][WS] Received: planning_question {...}
[PokéRalph][API] POST /api/planning/answer {...}
[PokéRalph][API] POST /api/planning/finish {...}
```

**Error Patterns to Watch:**
```
[PokéRalph][API] POST /api/planning/finish timed out
[PokéRalph][WS] Connection error
Failed to parse PRD from planning output
```

---

## Automated Test Ideas

Future automated tests could cover:

```typescript
// packages/web/tests/planning.test.tsx

describe("Planning View", () => {
  test("disables Start Planning button when textarea is empty");
  test("shows loading state when starting planning");
  test("displays Claude messages from WebSocket events");
  test("shows question input when in waiting_input state");
  test("enables Finish Planning when PRD is detected");
  test("displays PRD in Review stage after finishing");
  test("allows editing PRD fields in Review stage");
  test("saves PRD and redirects on Confirm");
  test("resets to input stage on Cancel");
  test("restores session state on page reload");
});
```

---

## Test Results Template

After running tests, update TESTING.md:

```markdown
### Flow 2: Create New Project (Planning)

| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 8 | Review Overview tab | Project name and description editable | | |
| 9 | Switch to Tasks tab | Task list with priorities visible | | |
| 10 | Edit a task title | Title updates in the list | | |
| 11 | Click "Confirm & Start" | PRD saved, redirects to Dashboard | | |
```

Mark status as:
- **PASS** - Works as expected
- **FAIL** - Doesn't work, needs fix
- **BLOCKED** - Can't test due to prerequisite failure
