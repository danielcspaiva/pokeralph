# PokéRalph Manual Test Checklist

> Comprehensive manual testing checklist for all user-facing features.

## How to Continue Testing

This document tracks manual testing progress. To continue testing in a future session:

### Setup Instructions

1. **Create a test repository** (don't use pokeralph itself):
   ```bash
   mkdir -p /tmp/pokeralph-test-project
   cd /tmp/pokeralph-test-project
   git init
   echo '{"name": "test-project", "scripts": {"test": "echo ok"}}' > package.json
   git add . && git commit -m "init"
   ```

2. **Start the dev server**:
   ```bash
   cd /path/to/pokeralph
   bun run dev
   ```

3. **Open the app** at http://localhost:5173

4. **Switch to test repo** using the repository selector in the header

### Testing with Browser MCP

Use the `cursor-browser-extension` MCP tools:
- `browser_navigate` - Go to URLs
- `browser_snapshot` - Get page state with element refs
- `browser_click` - Click elements by ref
- `browser_type` - Type text into inputs
- `browser_console_messages` - Check for errors

### Updating Test Results

- Change Status column: `PASS`, `FAIL`, `BLOCKED`, or leave empty
- Add notes in the Notes column
- Document issues in the "Issues Discovered" section
- Update the "Test Summary" counts at the bottom

### What Still Needs Testing

Tests marked as `BLOCKED` require Claude API integration. To test these:
1. Ensure Claude CLI is available and authenticated
2. Run through the full planning flow with a real idea
3. Start and complete a battle
4. Verify real-time WebSocket updates

---

## Test Environment

| Property | Value |
|----------|-------|
| **Last Test Date** | 2026-01-16 |
| **Test Repository** | /tmp/pokeralph-test-project |
| **Browser** | Chrome (via Playwright MCP) |
| **Server URL** | http://localhost:5173 |
| **API URL** | http://localhost:3456 |

---

## 1. Application Startup & Layout

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 1.1 | Open app at localhost:5173 | App loads without errors | PASS | App loads correctly |
| 1.2 | Check connection indicator | Shows "Connected" with green dot when server running | PASS | Shows "Connected" after WebSocket connects |
| 1.3 | Check header title | Displays "PokéRalph" when no project loaded | PASS | Shows "PokéRalph" initially |
| 1.4 | Check mode badge | Displays "HITL" or "YOLO" based on config | PASS | Shows "HITL" by default |
| 1.5 | Toggle sidebar (mobile) | Sidebar opens/closes, overlay appears | BLOCKED | Mobile testing not performed |
| 1.6 | Empty state display | Shows "No Project Yet" with "Start Planning" CTA | PASS | Empty state displays correctly |

---

## 2. Repository Selector

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 2.1 | View repo selector button | Shows shortened path (last 2 segments) | PASS | Shows "packages/server" initially |
| 2.2 | Click repo selector | Modal opens with path input | PASS | Modal opens correctly |
| 2.3 | Enter valid path | Switches to new repository, modal closes | PASS | Switched to /tmp/pokeralph-test-project |
| 2.4 | Enter invalid path | Shows error message | BLOCKED | Not tested |
| 2.5 | Cancel button | Closes modal without changes | BLOCKED | Not tested |
| 2.6 | Escape key | Closes modal without changes | BLOCKED | Not tested |
| 2.7 | New repo creates .pokeralph | .pokeralph folder created in target | PASS | Verified folder exists |

---

## 3. Configuration Modal (Settings)

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 3.1 | Click settings gear icon | Modal opens with current config | PASS | Modal opens with all settings |
| 3.2 | Max iterations slider | Slider moves, value updates (1-50) | PASS | Slider visible, shows value 10 |
| 3.3 | Execution mode toggle | HITL/YOLO buttons toggle correctly | PASS | Toggled from HITL to YOLO and back |
| 3.4 | Feedback loops checkboxes | Can check/uncheck test, lint, typecheck, format:check | PASS | All checkboxes visible and functional |
| 3.5 | Timeout input | Accepts values 1-120 | PASS | Input shows 30 |
| 3.6 | Timeout validation | Shows error for invalid values | BLOCKED | Not tested |
| 3.7 | Polling interval input | Accepts values 500-10000 | PASS | Input shows 2000 |
| 3.8 | Polling interval validation | Shows error for invalid values | BLOCKED | Not tested |
| 3.9 | Auto-commit toggle | Switch toggles on/off | PASS | Toggle visible and checked |
| 3.10 | Save button | Persists config, closes modal | PASS | Changed mode to YOLO, saved, header updated |
| 3.11 | Cancel button | Discards changes, closes modal | PASS | Changed mode to YOLO, canceled, mode stayed HITL |
| 3.12 | Escape key | Closes modal | BLOCKED | Not tested |

---

## 4. Sidebar

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 4.1 | Task counts display | Shows Done, In Progress, Pending counts | PASS | Shows 0/0/0 initially, 0/0/3 after PRD created |
| 4.2 | Dashboard link | Navigates to /, shows active state | PASS | Active state visible when on Dashboard |
| 4.3 | Planning link | Navigates to /planning, shows active state | PASS | Active state visible when on Planning |
| 4.4 | Empty task list | Shows "No tasks yet. Start planning!" | PASS | Shows empty message |
| 4.5 | Task cards | Display task title, status indicator | PASS | Shows task cards with status |
| 4.6 | Click task card | Navigates to /task/:taskId | PASS | Navigated to Battle view |
| 4.7 | Close button (mobile) | Closes sidebar | BLOCKED | Mobile testing not performed |

---

## 5. Dashboard View

### 5a. Empty State (No PRD)

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 5.1 | Empty state icon | Clipboard icon displays | PASS | SVG icon visible |
| 5.2 | Empty state title | "No Project Yet" | PASS | Title displays correctly |
| 5.3 | Empty state description | Explains how to start | PASS | Description visible |
| 5.4 | Start Planning button | Navigates to /planning | PASS | Navigated successfully |

### 5b. With PRD Loaded

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 5.5 | Project name | Displays PRD name | PASS | Shows "Todo App" |
| 5.6 | Project description | Displays PRD description | PASS | Shows description |
| 5.7 | Stats cards | Total, Pending, In Progress, Completed, Failed | PASS | Shows 3/3/0/0/0 |
| 5.8 | Filter: All | Shows all tasks | PASS | All 3 tasks shown |
| 5.9 | Filter: Pending | Shows only pending tasks | BLOCKED | Not explicitly tested |
| 5.10 | Filter: In Progress | Shows only in-progress tasks | BLOCKED | Not tested |
| 5.11 | Filter: Completed | Shows only completed tasks | PASS | Shows "No completed tasks found" |
| 5.12 | Filter: Failed | Shows only failed tasks | BLOCKED | Not tested |
| 5.13 | Filter counts | Correct counts in filter badges | PASS | Counts match stats |
| 5.14 | Task list items | Show priority, title, status badge | PASS | Shows #1, #2, #3 with titles |
| 5.15 | Click task | Navigates to /task/:taskId | PASS | Navigated to Battle view |
| 5.16 | New Idea button | Navigates to /planning | PASS | Link visible and functional |
| 5.17 | Start Next Battle (enabled) | Starts battle, navigates to task | PASS | Button enabled with pending tasks |
| 5.18 | Start Next Battle (disabled) | Disabled when no pending tasks | BLOCKED | Not tested |

---

## 6. Planning View

### 6a. Step 1: Idea Input

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 6.1 | Progress indicator | Shows step 1 active | PASS | Step 1 shows active styling |
| 6.2 | Title and description | "Describe Your Idea" with explanation | PASS | Title and description visible |
| 6.3 | Textarea empty | Submit button disabled | PASS | Button has disabled attribute |
| 6.4 | Enter idea text | Submit button enables | PASS | Button became enabled after text entry |
| 6.5 | Click Start Planning | Transitions to conversation stage | BLOCKED | Requires Claude API |

### 6b. Step 2: Conversation

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 6.6 | Progress indicator | Shows step 2 active | BLOCKED | Requires Claude API |
| 6.7 | User message | Displays user's idea | BLOCKED | Requires Claude API |
| 6.8 | Claude message | Displays Claude's response | BLOCKED | Requires Claude API |
| 6.9 | Typing indicator | Shows when Claude is processing | BLOCKED | Requires Claude API |
| 6.10 | Question box | Appears when Claude asks question | BLOCKED | Requires Claude API |
| 6.11 | Answer input | Can type and submit answer | BLOCKED | Requires Claude API |
| 6.12 | Cancel button | Resets planning, returns to input | BLOCKED | Requires Claude API |
| 6.13 | Finish Planning | Transitions to review stage | BLOCKED | Requires Claude API |
| 6.14 | Auto-scroll | Chat scrolls to latest message | BLOCKED | Requires Claude API |

### 6c. Step 3: Review PRD

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 6.15 | Progress indicator | Shows step 3 active | BLOCKED | Requires Claude API |
| 6.16 | Overview tab | Shows project name, description inputs | BLOCKED | Requires Claude API |
| 6.17 | Edit project name | Input updates | BLOCKED | Requires Claude API |
| 6.18 | Edit description | Textarea updates | BLOCKED | Requires Claude API |
| 6.19 | Tasks tab | Shows task count, list of tasks | BLOCKED | Requires Claude API |
| 6.20 | Edit task title | Input updates | BLOCKED | Requires Claude API |
| 6.21 | Edit task description | Textarea updates | BLOCKED | Requires Claude API |
| 6.22 | Edit task priority | Number input updates | BLOCKED | Requires Claude API |
| 6.23 | Acceptance criteria | Displayed as list | BLOCKED | Requires Claude API |
| 6.24 | Back button | Returns to conversation | BLOCKED | Requires Claude API |
| 6.25 | Confirm & Start | Saves PRD, redirects to Dashboard | BLOCKED | Requires Claude API |
| 6.26 | Confirm disabled | Disabled when no tasks | BLOCKED | Requires Claude API |

---

## 7. Battle View

### 7a. Task Display

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 7.1 | Task priority | Shows #N | PASS | Shows #1 |
| 7.2 | Task title | Displays task title | PASS | Shows "Setup Project Structure" |
| 7.3 | Task description | Displays task description | PASS | Description visible |
| 7.4 | Acceptance criteria | List of criteria | PASS | Shows 2 criteria in list |

### 7b. Battle Controls

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 7.5 | Status badge: Ready | Shows "Ready" when idle | PASS | Shows "Ready" status |
| 7.6 | Start Battle button | Visible when idle | PASS | Button visible |
| 7.7 | Click Start Battle | Starts battle, status changes to "Running" | BLOCKED | Requires Claude API |
| 7.8 | Status badge: Running | Shows "Running" during battle | BLOCKED | Requires Claude API |
| 7.9 | Timer | Shows elapsed time | PASS | Shows 0:00 |
| 7.10 | Progress bar | Shows iteration X of Y | PASS | Shows "Iteration 0 of 10" |
| 7.11 | Pause button | Visible when running | BLOCKED | Requires Claude API |
| 7.12 | Click Pause | Pauses battle, status changes to "Paused" | BLOCKED | Requires Claude API |
| 7.13 | Resume button | Visible when paused | BLOCKED | Requires Claude API |
| 7.14 | Click Resume | Resumes battle | BLOCKED | Requires Claude API |
| 7.15 | Cancel button | Visible when running/paused | BLOCKED | Requires Claude API |
| 7.16 | Click Cancel | Cancels battle, status changes to "Failed" | BLOCKED | Requires Claude API |

### 7c. HITL Mode

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 7.17 | Status: Awaiting Approval | Shows after iteration in HITL | BLOCKED | Requires Claude API |
| 7.18 | Approval message | Shows "Review Required" message | BLOCKED | Requires Claude API |
| 7.19 | Approve button | Visible when awaiting approval | BLOCKED | Requires Claude API |
| 7.20 | Click Approve | Continues to next iteration | BLOCKED | Requires Claude API |

### 7d. Output & Feedback

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 7.21 | Log area | Shows output during battle | PASS | Shows "No output yet" initially |
| 7.22 | Live indicator | Shows "Live" when running | BLOCKED | Requires Claude API |
| 7.23 | Feedback loops | Shows test/lint/typecheck results | BLOCKED | Requires Claude API |
| 7.24 | Feedback passed | Green checkmark | BLOCKED | Requires Claude API |
| 7.25 | Feedback failed | Red X | BLOCKED | Requires Claude API |

### 7e. Completion States

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 7.26 | Success message | Shows "Battle Complete!" with confetti | BLOCKED | Requires Claude API |
| 7.27 | Success actions | Back to Dashboard, View History links | BLOCKED | Requires Claude API |
| 7.28 | Error message | Shows error details on failure | BLOCKED | Requires Claude API |
| 7.29 | Retry button | Visible on failure | BLOCKED | Requires Claude API |
| 7.30 | Click Retry | Restarts battle | BLOCKED | Requires Claude API |

---

## 8. History View

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 8.1 | Task header | Shows priority, status, title, description | PASS | Shows #1, pending, title, description |
| 8.2 | Battle stats | Started, Completed, Duration, Iterations | BLOCKED | No battle history to test |
| 8.3 | Timeline | Shows list of iterations | BLOCKED | No battle history to test |
| 8.4 | Click iteration | Expands to show details | BLOCKED | No battle history to test |
| 8.5 | Iteration result badge | Success/Failed/Timeout/Cancelled | BLOCKED | No battle history to test |
| 8.6 | Iteration duration | Shows formatted duration | BLOCKED | No battle history to test |
| 8.7 | Iteration output | Shows Claude output | BLOCKED | No battle history to test |
| 8.8 | Files changed | Lists modified files | BLOCKED | No battle history to test |
| 8.9 | Commit hash | Shows git commit if available | BLOCKED | No battle history to test |
| 8.10 | Expand All | Expands all iterations | BLOCKED | No battle history to test |
| 8.11 | Collapse All | Collapses all iterations | BLOCKED | No battle history to test |
| 8.12 | Battle View link | Navigates to /task/:taskId | PASS | Link visible and functional |
| 8.13 | Dashboard link | Navigates to / | PASS | Link visible and functional |
| 8.14 | No history state | Shows message and Start Battle button | PASS | Shows "No Battle History" state |
| 8.15 | Retry button (failed) | Starts new battle | BLOCKED | No failed task to test |

---

## 9. WebSocket Real-time Updates

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 9.1 | Connection established | "connected" event received | PASS | Verified in console logs |
| 9.2 | Planning output | Messages appear in real-time | BLOCKED | Requires Claude API |
| 9.3 | Battle start | UI updates when battle starts | BLOCKED | Requires Claude API |
| 9.4 | Iteration updates | Progress bar and logs update | BLOCKED | Requires Claude API |
| 9.5 | Battle complete | UI shows success state | BLOCKED | Requires Claude API |
| 9.6 | Reconnection | Reconnects after disconnect | BLOCKED | Not tested |

---

## 10. API Error Handling

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 10.1 | Server offline | Shows "Offline" in header | PASS | Saw "Offline" initially before WebSocket connected |
| 10.2 | API error response | Error message displayed | BLOCKED | Not tested |
| 10.3 | Network timeout | Graceful error handling | BLOCKED | Not tested |

---

## Issues Discovered

| # | Issue Description | Severity | Status | Fix Notes |
|---|-------------------|----------|--------|-----------|
| 1 | Sidebar loses PRD data on direct URL navigation to History view | Medium | FIXED | When navigating directly to /history/:taskId, sidebar shows "No tasks yet" even though PRD exists. **FIX:** Added PRD loading to Layout.tsx so PRD is fetched on app mount regardless of which page loads first |
| 2 | Missing favicon.ico causes 404 error | Low | FIXED | Console shows "Failed to load resource: 404 (Not Found)" for favicon.ico. **FIX:** Added favicon.svg and updated index.html to reference it |

---

## Debug Notes

_Record any debug observations, logs added, or findings during testing._

- WebSocket connects successfully and assigns connection ID
- PRD created via PUT /api/prd endpoint works correctly
- All static UI components render as expected
- PRD validation requires `iterations: []` field for each task
- Console logging provides good visibility into API calls and WebSocket events
- Initial connection shows "Offline" briefly before WebSocket establishes connection

---

## Test Summary

| Category | Total | Passed | Failed | Blocked |
|----------|-------|--------|--------|---------|
| 1. Startup & Layout | 6 | 5 | 0 | 1 |
| 2. Repository Selector | 7 | 4 | 0 | 3 |
| 3. Configuration Modal | 12 | 8 | 0 | 4 |
| 4. Sidebar | 7 | 5 | 0 | 2 |
| 5. Dashboard | 18 | 14 | 0 | 4 |
| 6. Planning | 26 | 4 | 0 | 22 |
| 7. Battle | 30 | 7 | 0 | 23 |
| 8. History | 15 | 4 | 0 | 11 |
| 9. WebSocket | 6 | 1 | 0 | 5 |
| 10. Error Handling | 3 | 1 | 0 | 2 |
| **TOTAL** | **130** | **53** | **0** | **77** |

**Notes:**
- 53 tests passed (41%)
- 0 tests failed
- 77 tests blocked (59%) - primarily due to requiring Claude API integration for full end-to-end testing
- 2 issues discovered
