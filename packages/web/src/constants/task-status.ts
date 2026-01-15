/**
 * Task status constants for the web package.
 *
 * These mirror the TaskStatus enum from @pokeralph/core but are defined
 * locally to avoid importing Node.js-dependent code into the browser.
 */

export const TaskStatus = {
  Pending: "pending",
  Planning: "planning",
  Ready: "ready",
  InProgress: "in_progress",
  Paused: "paused",
  Completed: "completed",
  Failed: "failed",
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];
