/**
 * Core types for PokéRalph
 * Types will be fully defined in Task 002
 */

/** Configuration for a PokéRalph project */
export interface Config {
  maxIterationsPerTask: number;
  mode: "hitl" | "yolo";
  feedbackLoops: string[];
  timeoutMinutes: number;
  pollingIntervalMs: number;
  autoCommit: boolean;
}

/** Default configuration values */
export const DEFAULT_CONFIG: Config = {
  maxIterationsPerTask: 10,
  mode: "hitl",
  feedbackLoops: ["test", "lint", "typecheck"],
  timeoutMinutes: 30,
  pollingIntervalMs: 2000,
  autoCommit: true,
};
