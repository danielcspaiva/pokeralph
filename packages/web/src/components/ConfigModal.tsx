/**
 * ConfigModal component for PokéRalph
 *
 * Modal interface for adjusting application settings.
 * All changes are persisted to the server via the config API.
 */

import { useState, useEffect, useCallback } from "react";
import type { Config, ExecutionMode } from "@pokeralph/core";
import { useConfig, useAppStore } from "../stores/app-store";
import { updateConfig as updateConfigApi } from "../api/client";
import styles from "./ConfigModal.module.css";

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

  /**
   * Handles closing without saving
   */
  const handleCancel = () => {
    setError(null);
    setErrors({});
    onClose();
  };

  /**
   * Handles keyboard events on the overlay
   */
  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdropButton}
        onClick={handleCancel}
        onKeyDown={handleOverlayKeyDown}
        aria-label="Close modal"
      />
      <dialog
        className={styles.modal}
        open
        aria-labelledby="config-modal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="config-modal-title" className={styles.title}>
            Settings
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleCancel}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className={styles.content}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          {/* Max Iterations Slider */}
          <div className={styles.formGroup}>
            <label htmlFor="maxIterations" className={styles.label}>
              Max Iterations per Task
              <span className={styles.value}>{maxIterations}</span>
            </label>
            <input
              type="range"
              id="maxIterations"
              min={1}
              max={50}
              value={maxIterations}
              onChange={(e) => setMaxIterations(Number(e.target.value))}
              className={styles.slider}
            />
            <div className={styles.sliderLabels}>
              <span>1</span>
              <span>25</span>
              <span>50</span>
            </div>
            {errors.maxIterationsPerTask && (
              <span className={styles.fieldError}>
                {errors.maxIterationsPerTask}
              </span>
            )}
          </div>

          {/* Execution Mode Toggle */}
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Execution Mode</legend>
            <div className={styles.toggleGroup}>
              <button
                type="button"
                className={`${styles.toggleButton} ${mode === "hitl" ? styles.active : ""}`}
                onClick={() => setMode("hitl")}
              >
                HITL
                <span className={styles.toggleHint}>Human in the Loop</span>
              </button>
              <button
                type="button"
                className={`${styles.toggleButton} ${mode === "yolo" ? styles.active : ""}`}
                onClick={() => setMode("yolo")}
              >
                YOLO
                <span className={styles.toggleHint}>Automatic</span>
              </button>
            </div>
          </fieldset>

          {/* Feedback Loops Checkboxes */}
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Feedback Loops</legend>
            <div className={styles.checkboxGroup}>
              {AVAILABLE_FEEDBACK_LOOPS.map((loop) => (
                <label key={loop} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={feedbackLoops.includes(loop)}
                    onChange={() => handleFeedbackLoopToggle(loop)}
                    className={styles.checkbox}
                  />
                  <span className={styles.checkboxText}>{loop}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Timeout Minutes Input */}
          <div className={styles.formGroup}>
            <label htmlFor="timeoutMinutes" className={styles.label}>
              Timeout (minutes)
            </label>
            <input
              type="number"
              id="timeoutMinutes"
              min={1}
              max={120}
              value={timeoutMinutes}
              onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
              className={`${styles.numberInput} ${errors.timeoutMinutes ? styles.inputError : ""}`}
            />
            {errors.timeoutMinutes && (
              <span className={styles.fieldError}>{errors.timeoutMinutes}</span>
            )}
          </div>

          {/* Polling Interval Input */}
          <div className={styles.formGroup}>
            <label htmlFor="pollingIntervalMs" className={styles.label}>
              Polling Interval (ms)
            </label>
            <input
              type="number"
              id="pollingIntervalMs"
              min={500}
              max={10000}
              step={100}
              value={pollingIntervalMs}
              onChange={(e) => setPollingIntervalMs(Number(e.target.value))}
              className={`${styles.numberInput} ${errors.pollingIntervalMs ? styles.inputError : ""}`}
            />
            {errors.pollingIntervalMs && (
              <span className={styles.fieldError}>
                {errors.pollingIntervalMs}
              </span>
            )}
          </div>

          {/* Auto Commit Toggle */}
          <div className={styles.formGroup}>
            <div className={styles.toggleLabel}>
              <span id="auto-commit-label" className={styles.label}>Auto-commit on Success</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoCommit}
                aria-labelledby="auto-commit-label"
                className={`${styles.switch} ${autoCommit ? styles.switchOn : ""}`}
                onClick={() => setAutoCommit(!autoCommit)}
              >
                <span className={styles.switchTrack}>
                  <span className={styles.switchThumb} />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
