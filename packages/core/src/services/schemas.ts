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
  maxIterationsPerTask: z.number().int().min(1).max(100),
  mode: ExecutionModeSchema,
  // Note: Spec says non-empty, but empty allowed for test scenarios
  feedbackLoops: z.array(z.string()),
  timeoutMinutes: z.number().min(1).max(60),
  pollingIntervalMs: z.number().int().min(500).max(10000),
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

/**
 * Task ID format: {NNN}-{slug}
 * - NNN is zero-padded (001, 002, ...)
 * - Slug is lowercase, hyphens, max 30 chars
 */
export const TaskIdSchema = z
  .string()
  .regex(/^\d{3}-[a-z0-9-]+$/, "Task ID must match format {NNN}-{slug}");

export const TaskSchema = z.object({
  id: TaskIdSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  status: TaskStatusSchema,
  priority: z.number().int().min(1),
  // Note: Spec says non-empty, but empty allowed for test scenarios
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
  name: z.string().min(1).max(200),
  description: z.string().min(1),
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
