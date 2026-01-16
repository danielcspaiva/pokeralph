/**
 * ConfigModal component for PokéRalph
 *
 * Modal interface for adjusting application settings.
 * All changes are persisted to the server via the config API.
 */

import { useState, useEffect, useCallback } from "react";
import type { Config, ExecutionMode } from "@pokeralph/core/types";
import { useConfig, useAppStore } from "../stores/app-store";
import { updateConfig as updateConfigApi } from "../api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface ConfigModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
}

/**
 * Available feedback loops that can be configured
 */
const AVAILABLE_FEEDBACK_LOOPS = ["test", "lint", "typecheck", "format:check"];

/**
 * Validation errors for form fields
 */
interface ValidationErrors {
  maxIterationsPerTask?: string;
  timeoutMinutes?: string;
  pollingIntervalMs?: string;
}

/**
 * Configuration modal for adjusting PokéRalph settings
 */
export function ConfigModal({ isOpen, onClose }: ConfigModalProps) {
  const currentConfig = useConfig();
  const setConfig = useAppStore((state) => state.setConfig);

  // Local form state
  const [maxIterations, setMaxIterations] = useState(10);
  const [mode, setMode] = useState<ExecutionMode>("hitl");
  const [feedbackLoops, setFeedbackLoops] = useState<string[]>([
    "test",
    "lint",
    "typecheck",
  ]);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const [pollingIntervalMs, setPollingIntervalMs] = useState(2000);
  const [autoCommit, setAutoCommit] = useState(true);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Initialize form with current config when modal opens
  useEffect(() => {
    if (isOpen && currentConfig) {
      setMaxIterations(currentConfig.maxIterationsPerTask);
      setMode(currentConfig.mode);
      setFeedbackLoops([...currentConfig.feedbackLoops]);
      setTimeoutMinutes(currentConfig.timeoutMinutes);
      setPollingIntervalMs(currentConfig.pollingIntervalMs);
      setAutoCommit(currentConfig.autoCommit);
      setError(null);
      setErrors({});
    }
  }, [isOpen, currentConfig]);

  /**
   * Validates form fields and returns whether form is valid
   */
  const validateForm = useCallback((): boolean => {
    const newErrors: ValidationErrors = {};

    if (maxIterations < 1 || maxIterations > 50) {
      newErrors.maxIterationsPerTask =
        "Max iterations must be between 1 and 50";
    }

    if (timeoutMinutes < 1 || timeoutMinutes > 120) {
      newErrors.timeoutMinutes = "Timeout must be between 1 and 120 minutes";
    }

    if (pollingIntervalMs < 500 || pollingIntervalMs > 10000) {
      newErrors.pollingIntervalMs =
        "Polling interval must be between 500 and 10000 ms";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [maxIterations, timeoutMinutes, pollingIntervalMs]);

  /**
   * Handles toggling a feedback loop on/off
   */
  const handleFeedbackLoopToggle = (loop: string) => {
    setFeedbackLoops((prev) =>
      prev.includes(loop) ? prev.filter((l) => l !== loop) : [...prev, loop]
    );
  };

  /**
   * Handles saving the configuration
   */
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updatedConfig: Partial<Config> = {
        maxIterationsPerTask: maxIterations,
        mode,
        feedbackLoops,
        timeoutMinutes,
        pollingIntervalMs,
        autoCommit,
      };

      const result = await updateConfigApi(updatedConfig);
      setConfig(result);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save configuration"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure PokéRalph behavior and execution settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="rounded-md bg-[hsl(var(--destructive)/0.1)] p-3 text-sm text-[hsl(var(--destructive))]">
              {error}
            </div>
          )}

          {/* Max Iterations Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxIterations">Max Iterations per Task</Label>
              <span className="text-sm font-medium">{maxIterations}</span>
            </div>
            <Slider
              id="maxIterations"
              min={1}
              max={50}
              step={1}
              value={[maxIterations]}
              onValueChange={(value) => setMaxIterations(value[0] ?? maxIterations)}
            />
            <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
              <span>1</span>
              <span>25</span>
              <span>50</span>
            </div>
            {errors.maxIterationsPerTask && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {errors.maxIterationsPerTask}
              </p>
            )}
          </div>

          <Separator />

          {/* Execution Mode Toggle */}
          <div className="space-y-3">
            <Label>Execution Mode</Label>
            <div className="flex rounded-lg bg-[hsl(var(--muted))] p-1">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  mode === "hitl"
                    ? "bg-[hsl(var(--background))] shadow"
                    : "hover:bg-[hsl(var(--background)/0.5)]"
                )}
                onClick={() => setMode("hitl")}
              >
                <div>HITL</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  Human in the Loop
                </div>
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  mode === "yolo"
                    ? "bg-[hsl(var(--background))] shadow"
                    : "hover:bg-[hsl(var(--background)/0.5)]"
                )}
                onClick={() => setMode("yolo")}
              >
                <div>YOLO</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  Automatic
                </div>
              </button>
            </div>
          </div>

          <Separator />

          {/* Feedback Loops Checkboxes */}
          <div className="space-y-3">
            <Label>Feedback Loops</Label>
            <div className="grid grid-cols-2 gap-3">
              {AVAILABLE_FEEDBACK_LOOPS.map((loop) => (
                <div key={loop} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={`feedback-${loop}`}
                    checked={feedbackLoops.includes(loop)}
                    onCheckedChange={() => handleFeedbackLoopToggle(loop)}
                  />
                  <Label htmlFor={`feedback-${loop}`}>{loop}</Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Timeout Minutes Input */}
          <div className="space-y-2">
            <Label htmlFor="timeoutMinutes">Timeout (minutes)</Label>
            <Input
              type="number"
              id="timeoutMinutes"
              min={1}
              max={120}
              value={timeoutMinutes}
              onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
              className={cn(
                errors.timeoutMinutes &&
                  "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]"
              )}
            />
            {errors.timeoutMinutes && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {errors.timeoutMinutes}
              </p>
            )}
          </div>

          {/* Polling Interval Input */}
          <div className="space-y-2">
            <Label htmlFor="pollingIntervalMs">Polling Interval (ms)</Label>
            <Input
              type="number"
              id="pollingIntervalMs"
              min={500}
              max={10000}
              step={100}
              value={pollingIntervalMs}
              onChange={(e) => setPollingIntervalMs(Number(e.target.value))}
              className={cn(
                errors.pollingIntervalMs &&
                  "border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]"
              )}
            />
            {errors.pollingIntervalMs && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {errors.pollingIntervalMs}
              </p>
            )}
          </div>

          <Separator />

          {/* Auto Commit Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="autoCommit">Auto-commit on Success</Label>
            <Switch
              id="autoCommit"
              checked={autoCommit}
              onCheckedChange={setAutoCommit}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
