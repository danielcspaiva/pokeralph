/**
 * Zod validation schemas for PokéRalph data files
 *
 * These schemas validate data read from JSON files to ensure
 * type safety at runtime.
 */

import { z } from "zod";
import { TaskStatus } from "../types/task.ts";

// ============================================================================
// Config Schema
// ============================================================================

export const ExecutionModeSchema = z.enum(["hitl", "yolo"]);

export const ConfigSchema = z.object({
  maxIterationsPerTask: z.number().int().positive(),
  mode: ExecutionModeSchema,
  feedbackLoops: z.array(z.string()),
  timeoutMinutes: z.number().positive(),
  pollingIntervalMs: z.number().int().positive(),
  autoCommit: z.boolean(),
});

// ============================================================================
// Task Schema
// ============================================================================

export const TaskStatusSchema = z.nativeEnum(TaskStatus);

export const IterationSchema = z.object({
  number: z.number().int().positive(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  output: z.string(),
  result: z.enum(["success", "failure", "timeout", "cancelled"]),
  filesChanged: z.array(z.string()),
  commitHash: z.string().optional(),
  error: z.string().optional(),
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: TaskStatusSchema,
  priority: z.number().int().positive(),
  acceptanceCriteria: z.array(z.string()),
  iterations: z.array(IterationSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ============================================================================
// PRD Schema
// ============================================================================

export const PRDMetadataSchema = z.object({
  version: z.string(),
  generatedBy: z.string().optional(),
  originalIdea: z.string().optional(),
});

export const PRDSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  tasks: z.array(TaskSchema),
  metadata: PRDMetadataSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

// ============================================================================
// Progress Schema
// ============================================================================

export const FeedbackResultSchema = z.object({
  passed: z.boolean(),
  output: z.string(),
  duration: z.number().optional(),
});

export const FeedbackResultsSchema = z.record(z.string(), FeedbackResultSchema);

export const ProgressStatusSchema = z.enum([
  "idle",
  "in_progress",
  "awaiting_approval",
  "completed",
  "failed",
]);

export const ProgressSchema = z.object({
  taskId: z.string().min(1),
  currentIteration: z.number().int().nonnegative(),
  status: ProgressStatusSchema,
  lastUpdate: z.string().datetime(),
  logs: z.array(z.string()),
  lastOutput: z.string(),
  completionDetected: z.boolean(),
  error: z.string().nullable(),
  feedbackResults: FeedbackResultsSchema,
});

// ============================================================================
// Battle Schema
// ============================================================================

export const BattleStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
]);

export const BattleSchema = z.object({
  taskId: z.string().min(1),
  status: BattleStatusSchema,
  iterations: z.array(IterationSchema),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
});

// ============================================================================
// Type exports (inferred from schemas)
// ============================================================================

export type ConfigSchema = z.infer<typeof ConfigSchema>;
export type TaskSchema = z.infer<typeof TaskSchema>;
export type PRDSchema = z.infer<typeof PRDSchema>;
export type ProgressSchema = z.infer<typeof ProgressSchema>;
export type BattleSchema = z.infer<typeof BattleSchema>;
export type IterationSchema = z.infer<typeof IterationSchema>;
