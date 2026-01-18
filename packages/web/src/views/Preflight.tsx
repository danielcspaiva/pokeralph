/**
 * Preflight view for PokéRalph
 *
 * Shows pre-battle validation checks, fix actions, and dry run preview.
 * Per SPECS/10-preflight.md
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Loader2,
  Check,
  X,
  AlertTriangle,
  Info,
  ArrowLeft,
  Play,
  Wrench,
  Eye,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Copy,
  Archive,
} from "lucide-react";
import {
  getTask,
  runPreflight,
  applyPreflightFix,
  restoreStash,
  runDryRun,
  startBattle,
  type PreflightReportDTO,
  type PreflightCheckResultDTO,
  type DryRunResult,
} from "@/api/client";
import { useConfig } from "@/stores/app-store";
import type { Task } from "@pokeralph/core/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// ==========================================================================
// Types
// ==========================================================================

type ViewState = "loading" | "preflight" | "dry-run" | "error";

// ==========================================================================
// Sub-components
// ==========================================================================

/**
 * Task summary card per spec (10-preflight.md lines 656-662)
 */
interface TaskSummaryProps {
  task: Task;
}

function TaskSummary({ task }: TaskSummaryProps) {
  return (
    <div className="battle-card p-4">
      <h3 className="font-bold text-sm text-[hsl(var(--battle-fg))] mb-3">Task Summary</h3>
      <div className="space-y-2 text-sm text-[hsl(var(--battle-fg))]">
        <div className="flex justify-between">
          <span className="opacity-70">Title:</span>
          <span className="font-medium">{task.title}</span>
        </div>
        <div className="flex justify-between items-start">
          <span className="opacity-70">Description:</span>
          <span className="font-medium text-right max-w-[60%] truncate" title={task.description}>
            {task.description.slice(0, 60)}{task.description.length > 60 ? "..." : ""}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Priority:</span>
          <span className="font-medium">{task.priority}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Criteria:</span>
          <span className="font-medium">{task.acceptanceCriteria.length} acceptance criteria</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Status icon for check result
 */
function CheckIcon({ result, severity }: { result: PreflightCheckResultDTO["result"]; severity: string }) {
  if (result.passed) {
    return <Check className="h-4 w-4 text-[hsl(120_50%_30%)]" />;
  }
  if (severity === "error") {
    return <X className="h-4 w-4 text-[hsl(0_60%_40%)]" />;
  }
  if (severity === "warning") {
    return <AlertTriangle className="h-4 w-4 text-[hsl(45_80%_40%)]" />;
  }
  return <Info className="h-4 w-4 text-[hsl(200_50%_50%)]" />;
}

/**
 * Single preflight check row per spec (10-preflight.md lines 668-688)
 */
interface CheckRowProps {
  checkResult: PreflightCheckResultDTO;
  taskId: string;
  onFixApplied: (checkId: string, updatedCheck: PreflightCheckResultDTO) => void;
  isFixing: string | null;
  setIsFixing: (checkId: string | null) => void;
}

function CheckRow({ checkResult, taskId, onFixApplied, isFixing, setIsFixing }: CheckRowProps) {
  const { check, result } = checkResult;
  const [showDetails, setShowDetails] = useState(false);

  const handleFix = async () => {
    setIsFixing(check.id);
    try {
      const response = await applyPreflightFix(taskId, check.id);
      if (response.result.success) {
        onFixApplied(check.id, response.updatedCheck);
      }
    } catch (error) {
      console.error("Fix failed:", error);
    } finally {
      setIsFixing(null);
    }
  };

  return (
    <div className="border-b border-[hsl(var(--battle-fg))]/20 last:border-b-0 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CheckIcon result={result} severity={check.severity} />
          <span className="font-medium text-[hsl(var(--battle-fg))] truncate">
            {check.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[hsl(var(--battle-fg))] opacity-70 truncate max-w-[200px]">
            {result.message}
          </span>
          {result.details && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setShowDetails(!showDetails)}
              title={showDetails ? "Hide details" : "Show details"}
            >
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          {!result.passed && check.hasAutoFix && (
            <Button
              variant="battle"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleFix}
              disabled={isFixing !== null}
            >
              {isFixing === check.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Wrench className="h-3 w-3 mr-1" />
                  Fix
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      {showDetails && result.details && (
        <div className="mt-2 ml-6 p-2 bg-[hsl(var(--battle-bg))] border border-[hsl(var(--battle-fg))]/30 text-xs font-mono text-[hsl(var(--battle-fg))] opacity-80 whitespace-pre-wrap">
          {result.details}
        </div>
      )}
      {result.suggestion && !result.passed && (
        <div className="mt-1 ml-6 text-xs text-[hsl(var(--battle-fg))] opacity-60">
          {result.suggestion}
        </div>
      )}
    </div>
  );
}

/**
 * Preflight checks grouped by category per spec (10-preflight.md lines 667-688)
 */
interface ChecksListProps {
  results: PreflightCheckResultDTO[];
  taskId: string;
  onCheckUpdated: (checkId: string, updatedCheck: PreflightCheckResultDTO) => void;
}

function ChecksList({ results, taskId, onCheckUpdated }: ChecksListProps) {
  const [isFixing, setIsFixing] = useState<string | null>(null);

  // Group by category
  const grouped = results.reduce(
    (acc, result) => {
      const cat = result.check.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(result);
      return acc;
    },
    {} as Record<string, PreflightCheckResultDTO[]>
  );

  const categoryOrder = ["environment", "git", "config", "task"];
  const categoryLabels: Record<string, string> = {
    environment: "Environment",
    git: "Git",
    config: "Configuration",
    task: "Task",
    system: "System",
  };

  return (
    <div className="battle-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-[hsl(var(--battle-fg))]">Preflight Checks</h3>
        <span className="text-sm text-[hsl(var(--battle-fg))] opacity-70">
          {results.filter((r) => r.result.passed).length} / {results.length}
        </span>
      </div>

      <ScrollArea className="max-h-[400px]">
        {categoryOrder.map((category) => {
          const checks = grouped[category];
          if (!checks || checks.length === 0) return null;

          return (
            <div key={category} className="mb-4 last:mb-0">
              <h4 className="text-xs font-bold text-[hsl(var(--battle-fg))] opacity-60 uppercase mb-2">
                {categoryLabels[category]}
              </h4>
              {checks.map((checkResult) => (
                <CheckRow
                  key={checkResult.check.id}
                  checkResult={checkResult}
                  taskId={taskId}
                  onFixApplied={onCheckUpdated}
                  isFixing={isFixing}
                  setIsFixing={setIsFixing}
                />
              ))}
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}

/**
 * Summary card per spec (10-preflight.md lines 691-697)
 */
interface SummaryCardProps {
  summary: PreflightReportDTO["summary"];
  canStart: boolean;
}

function SummaryCard({ summary, canStart }: SummaryCardProps) {
  return (
    <div className="battle-card p-4">
      <h3 className="font-bold text-sm text-[hsl(var(--battle-fg))] mb-3">Summary</h3>
      <div className="flex flex-wrap gap-3 mb-3">
        <Badge variant="success" className="gap-1">
          <Check className="h-3 w-3" />
          {summary.passed} passed
        </Badge>
        {summary.warnings > 0 && (
          <Badge variant="outline" className="gap-1 border-[hsl(45_80%_40%)] text-[hsl(45_80%_40%)]">
            <AlertTriangle className="h-3 w-3" />
            {summary.warnings} warning{summary.warnings > 1 ? "s" : ""}
          </Badge>
        )}
        {summary.errors > 0 && (
          <Badge variant="destructive" className="gap-1">
            <X className="h-3 w-3" />
            {summary.errors} error{summary.errors > 1 ? "s" : ""}
          </Badge>
        )}
        {summary.infos > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Info className="h-3 w-3" />
            {summary.infos} info
          </Badge>
        )}
      </div>
      <p className="text-sm text-[hsl(var(--battle-fg))]">
        {canStart
          ? summary.warnings > 0
            ? "Battle can start. Review warnings above if concerned."
            : "All checks passed. Ready to battle!"
          : "Cannot start battle. Fix errors above first."}
      </p>
    </div>
  );
}

/**
 * Configuration display per spec (10-preflight.md lines 700-706)
 */
interface ConfigDisplayProps {
  config: {
    mode: string;
    maxIterationsPerTask: number;
    feedbackLoops: string[];
    autoCommit: boolean;
  } | null;
}

function ConfigDisplay({ config }: ConfigDisplayProps) {
  if (!config) return null;

  return (
    <div className="battle-card p-4">
      <h3 className="font-bold text-sm text-[hsl(var(--battle-fg))] mb-3">Battle Configuration</h3>
      <div className="space-y-2 text-sm text-[hsl(var(--battle-fg))]">
        <div className="flex justify-between">
          <span className="opacity-70">Mode:</span>
          <span className="font-medium uppercase">{config.mode}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Max Iterations:</span>
          <span className="font-medium">{config.maxIterationsPerTask}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Auto-commit:</span>
          <span className="font-medium">{config.autoCommit ? "Enabled" : "Disabled"}</span>
        </div>
        <div className="flex justify-between items-start">
          <span className="opacity-70">Feedback Loops:</span>
          <span className="font-medium text-right">
            {config.feedbackLoops.length > 0
              ? config.feedbackLoops.join(" → ")
              : "None configured"}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Stash restore action per spec (10-preflight.md lines 87-101)
 */
interface StashRestoreProps {
  stashRef: string;
  onRestored: () => void;
}

function StashRestore({ stashRef, onRestored }: StashRestoreProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestore = async () => {
    setIsRestoring(true);
    setError(null);
    try {
      const response = await restoreStash(stashRef);
      if (response.result.success) {
        onRestored();
      } else {
        setError(response.result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore stash");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="battle-card p-4 border-[hsl(45_80%_40%)]">
      <div className="flex items-center gap-2 mb-2">
        <Archive className="h-4 w-4 text-[hsl(45_80%_40%)]" />
        <span className="font-bold text-sm text-[hsl(var(--battle-fg))]">
          Stashed Changes Available
        </span>
      </div>
      <p className="text-sm text-[hsl(var(--battle-fg))] opacity-70 mb-3">
        Your uncommitted changes were stashed during preflight. Restore them when ready.
      </p>
      {error && (
        <p className="text-sm text-[hsl(0_60%_40%)] mb-2">{error}</p>
      )}
      <Button
        variant="battle"
        size="sm"
        onClick={handleRestore}
        disabled={isRestoring}
      >
        {isRestoring ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Restoring...
          </>
        ) : (
          <>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore Stashed Changes
          </>
        )}
      </Button>
    </div>
  );
}

/**
 * Confidence indicator per spec (10-preflight.md line 977)
 */
function ConfidenceIndicator({ level }: { level: "high" | "medium" | "low" }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="inline-flex gap-0.5" title={`${level} confidence`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            i <= filled
              ? "bg-[hsl(var(--battle-fg))]"
              : "bg-[hsl(var(--battle-fg))]/30"
          }`}
        />
      ))}
    </span>
  );
}

/**
 * Dry run results view per spec (10-preflight.md lines 933-988)
 */
interface DryRunViewProps {
  result: DryRunResult;
  onClose: () => void;
  onStartBattle: () => void;
  isStarting: boolean;
}

function DryRunView({ result, onClose, onStartBattle, isStarting }: DryRunViewProps) {
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = showFullPrompt ? result.prompt.full : result.prompt.redacted;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Estimated Outcomes */}
      <div className="battle-card p-4">
        <h3 className="font-bold text-sm text-[hsl(var(--battle-fg))] mb-3">Estimated Outcomes</h3>
        <div className="space-y-3 text-sm text-[hsl(var(--battle-fg))]">
          <div className="flex justify-between items-center">
            <span className="opacity-70">Iterations:</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {result.estimatedIterations.min}-{result.estimatedIterations.max}
              </span>
              <ConfidenceIndicator level={result.estimatedIterations.confidence} />
            </div>
          </div>
          <div className="text-xs opacity-60 -mt-2 ml-4">
            {result.estimatedIterations.reason}
          </div>
          <div className="flex justify-between items-center">
            <span className="opacity-70">Duration:</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {result.estimatedDuration.min}-{result.estimatedDuration.max} min
              </span>
              <ConfidenceIndicator level={result.estimatedDuration.confidence} />
            </div>
          </div>
          <div className="text-xs opacity-60 -mt-2 ml-4">
            {result.estimatedDuration.reason}
          </div>
        </div>
      </div>

      {/* Files Likely Affected */}
      <div className="battle-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-[hsl(var(--battle-fg))]">Files Likely Affected</h3>
          <ConfidenceIndicator level={result.filesLikelyAffected.confidence} />
        </div>
        {result.filesLikelyAffected.files.length > 0 ? (
          <ul className="text-sm font-mono text-[hsl(var(--battle-fg))]">
            {result.filesLikelyAffected.files.map((file) => (
              <li key={file} className="opacity-80">{file}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--battle-fg))] opacity-60">
            No specific files identified
          </p>
        )}
        <p className="text-xs text-[hsl(var(--battle-fg))] opacity-60 mt-2">
          {result.filesLikelyAffected.reason}
        </p>
      </div>

      {/* Prompt Preview */}
      <div className="battle-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-[hsl(var(--battle-fg))]">Prompt Preview</h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[hsl(var(--battle-fg))]">
              <input
                type="checkbox"
                checked={showFullPrompt}
                onChange={(e) => setShowFullPrompt(e.target.checked)}
                className="w-3 h-3"
              />
              Show full prompt
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
        <ScrollArea className="h-48 bg-[hsl(var(--battle-bg))] border border-[hsl(var(--battle-fg))]/30 p-3">
          <pre className="text-xs font-mono text-[hsl(var(--battle-fg))] whitespace-pre-wrap">
            {showFullPrompt ? result.prompt.full : result.prompt.redacted}
          </pre>
        </ScrollArea>
        {result.prompt.redactedFields.length > 0 && (
          <p className="text-xs text-[hsl(45_80%_40%)] mt-2">
            {result.prompt.redactedFields.length} field{result.prompt.redactedFields.length > 1 ? "s" : ""} redacted: {result.prompt.redactedFields.join(", ")}
          </p>
        )}
        <p className="text-xs text-[hsl(var(--battle-fg))] opacity-60 mt-1">
          (~{result.promptTokens.toLocaleString()} tokens)
        </p>
      </div>

      {/* Confidence Legend */}
      <div className="text-xs text-[hsl(var(--battle-fg))] opacity-60 text-center">
        Confidence Legend: <ConfidenceIndicator level="high" /> High &nbsp;
        <ConfidenceIndicator level="medium" /> Medium &nbsp;
        <ConfidenceIndicator level="low" /> Low
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="battle" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="battle" onClick={onStartBattle} disabled={isStarting}>
          {isStarting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Start Battle
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Error state per spec (10-preflight.md lines 729-750)
 */
interface ErrorStateProps {
  errors: PreflightCheckResultDTO[];
}

function ErrorState({ errors }: ErrorStateProps) {
  return (
    <div className="battle-card p-6 border-[hsl(0_60%_40%)]">
      <div className="flex items-center gap-2 mb-4">
        <X className="h-6 w-6 text-[hsl(0_60%_40%)]" />
        <h3 className="font-bold text-lg text-[hsl(0_60%_40%)]">Cannot Start Battle</h3>
      </div>
      <p className="text-sm text-[hsl(var(--battle-fg))] mb-4">
        {errors.length} blocking issue{errors.length > 1 ? "s" : ""} found:
      </p>
      <div className="space-y-3">
        {errors.map((checkResult) => (
          <div
            key={checkResult.check.id}
            className="bg-[hsl(var(--battle-bg))] border-2 border-[hsl(var(--battle-fg))] p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <X className="h-4 w-4 text-[hsl(0_60%_40%)]" />
              <span className="font-bold text-sm text-[hsl(var(--battle-fg))]">
                {checkResult.check.name}
              </span>
            </div>
            <p className="text-sm text-[hsl(var(--battle-fg))] opacity-80 ml-6">
              {checkResult.result.message}
            </p>
            {checkResult.result.suggestion && (
              <p className="text-xs text-[hsl(var(--battle-fg))] opacity-60 ml-6 mt-1">
                {checkResult.result.suggestion}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Loading state
 */
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="mb-4 h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      <p className="text-[hsl(var(--muted-foreground))]">Running preflight checks...</p>
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

/**
 * Preflight view component
 */
export function Preflight() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const config = useConfig();

  // State
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [task, setTask] = useState<Task | null>(null);
  const [report, setReport] = useState<PreflightReportDTO | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStartingBattle, setIsStartingBattle] = useState(false);
  const [isRunningDryRun, setIsRunningDryRun] = useState(false);

  // Load task and run preflight on mount
  useEffect(() => {
    async function loadAndRun() {
      if (!taskId) {
        setError("No task ID provided");
        setViewState("error");
        return;
      }

      try {
        // Load task
        const loadedTask = await getTask(taskId);
        setTask(loadedTask);

        // Run preflight
        const preflightResponse = await runPreflight(taskId);
        setReport(preflightResponse.report);
        setViewState("preflight");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load preflight");
        setViewState("error");
      }
    }

    loadAndRun();
  }, [taskId]);

  // Re-run preflight
  const handleRerun = useCallback(async () => {
    if (!taskId) return;

    setViewState("loading");
    try {
      const preflightResponse = await runPreflight(taskId);
      setReport(preflightResponse.report);
      setViewState("preflight");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run preflight");
      setViewState("error");
    }
  }, [taskId]);

  // Update individual check result
  const handleCheckUpdated = useCallback(
    (checkId: string, updatedCheck: PreflightCheckResultDTO) => {
      setReport((prev) => {
        if (!prev) return prev;
        const newResults = prev.results.map((r) =>
          r.check.id === checkId ? updatedCheck : r
        );
        // Recalculate summary
        const passed = newResults.filter((r) => r.result.passed).length;
        const errors = newResults.filter(
          (r) => !r.result.passed && !r.result.canProceed
        ).length;
        const warnings = newResults.filter(
          (r) => !r.result.passed && r.result.canProceed && r.check.severity === "warning"
        ).length;
        const canStart = errors === 0;

        return {
          ...prev,
          results: newResults,
          summary: {
            ...prev.summary,
            passed,
            errors,
            warnings,
          },
          canStart,
        };
      });
    },
    []
  );

  // Run dry run
  const handleDryRun = async () => {
    if (!taskId) return;

    setIsRunningDryRun(true);
    try {
      const response = await runDryRun(taskId);
      setDryRunResult(response.result);
      setViewState("dry-run");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run dry run");
    } finally {
      setIsRunningDryRun(false);
    }
  };

  // Start battle
  const handleStartBattle = async () => {
    if (!taskId) return;

    setIsStartingBattle(true);
    try {
      await startBattle(taskId, config?.mode ?? "hitl");
      navigate(`/task/${encodeURIComponent(taskId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start battle");
      setIsStartingBattle(false);
    }
  };

  // Handle stash restored
  const handleStashRestored = useCallback(() => {
    // Update report to remove stashRef
    setReport((prev) => (prev ? { ...prev, stashRef: undefined } : prev));
  }, []);

  // Show loading
  if (viewState === "loading") {
    return (
      <div className="battle-lcd p-6 min-h-full">
        <LoadingState />
      </div>
    );
  }

  // Show error
  if (viewState === "error") {
    return (
      <div className="battle-lcd p-6 min-h-full space-y-4">
        <div className="battle-card p-6 border-[hsl(0_60%_40%)]">
          <X className="mx-auto mb-4 h-10 w-10 text-[hsl(0_60%_40%)]" />
          <h2 className="text-lg font-bold text-center text-[hsl(0_60%_40%)]">Error</h2>
          <p className="mt-2 text-center text-[hsl(var(--battle-fg))]">{error}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="battle" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          <Button variant="battle" onClick={handleRerun}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Show dry run results
  if (viewState === "dry-run" && dryRunResult) {
    return (
      <div className="battle-lcd p-6 min-h-full space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="h-5 w-5 text-[hsl(var(--battle-fg))]" />
          <h2 className="text-lg font-bold text-[hsl(var(--battle-fg))]">Dry Run Results</h2>
        </div>
        <DryRunView
          result={dryRunResult}
          onClose={() => setViewState("preflight")}
          onStartBattle={handleStartBattle}
          isStarting={isStartingBattle}
        />
      </div>
    );
  }

  // Show preflight results
  if (!report || !task) {
    return <LoadingState />;
  }

  const errorChecks = report.results.filter(
    (r) => !r.result.passed && !r.result.canProceed
  );

  return (
    <div className="battle-lcd p-6 min-h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[hsl(var(--battle-fg))]">
          Battle Preflight: {task.id}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRerun}
          title="Re-run preflight"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Task summary */}
      <TaskSummary task={task} />

      {/* Error state if blocking errors */}
      {errorChecks.length > 0 && <ErrorState errors={errorChecks} />}

      {/* Checks list */}
      <ChecksList
        results={report.results}
        taskId={taskId!}
        onCheckUpdated={handleCheckUpdated}
      />

      {/* Summary */}
      <SummaryCard summary={report.summary} canStart={report.canStart} />

      {/* Configuration */}
      <ConfigDisplay
        config={
          config
            ? {
                mode: config.mode,
                maxIterationsPerTask: config.maxIterationsPerTask,
                feedbackLoops: config.feedbackLoops,
                autoCommit: config.autoCommit,
              }
            : null
        }
      />

      {/* Stash restore action - visible per spec requirement */}
      {report.stashRef && (
        <StashRestore stashRef={report.stashRef} onRestored={handleStashRestored} />
      )}

      {/* Actions per spec (10-preflight.md line 708) */}
      <div className="flex justify-end gap-2">
        <Button variant="battle" asChild>
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Link>
        </Button>
        <Button
          variant="battle"
          onClick={handleDryRun}
          disabled={isRunningDryRun || !report.canStart}
        >
          {isRunningDryRun ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Eye className="mr-2 h-4 w-4" />
              Run Dry Run
            </>
          )}
        </Button>
        <Button
          variant="battle"
          onClick={handleStartBattle}
          disabled={isStartingBattle || !report.canStart}
        >
          {isStartingBattle ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Start Battle
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
