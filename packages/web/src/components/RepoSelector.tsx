/**
 * RepoSelector component for PokéRalph
 *
 * Allows users to view and change the current working directory/repository.
 * Displays the current path and provides a modal to change it.
 */

import { useState, useEffect } from "react";
import { useWorkingDir, useHasPokeralphFolder, useAppStore } from "../stores/app-store";
import { getWorkingDir, setWorkingDir } from "../api/client";
import styles from "./RepoSelector.module.css";

/**
 * Repository selector component
 */
export function RepoSelector() {
  const currentWorkingDir = useWorkingDir();
  const hasPokeralphFolder = useHasPokeralphFolder();
  const setWorkingDirState = useAppStore((state) => state.setWorkingDir);

  const [isOpen, setIsOpen] = useState(false);
  const [inputPath, setInputPath] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current working directory on mount
  useEffect(() => {
    const fetchWorkingDir = async () => {
      try {
        const response = await getWorkingDir();
        setWorkingDirState(response.workingDir, response.hasPokeralphFolder);
      } catch {
        // Ignore errors on initial fetch
      }
    };
    fetchWorkingDir();
  }, [setWorkingDirState]);

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) {
      setInputPath(currentWorkingDir ?? "");
      setError(null);
    }
  }, [isOpen, currentWorkingDir]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputPath.trim()) {
      setError("Path is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await setWorkingDir(inputPath.trim());
      setWorkingDirState(response.workingDir, true);
      setIsOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change repository"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setError(null);
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  // Display a shortened path for the button
  const displayPath = currentWorkingDir
    ? currentWorkingDir.split("/").slice(-2).join("/")
    : "No repository";

  return (
    <>
      <button
        type="button"
        className={styles.selector}
        onClick={() => setIsOpen(true)}
        title={currentWorkingDir ?? "Select repository"}
      >
        <span className={styles.folderIcon}>
          {hasPokeralphFolder ? "\uD83D\uDCC2" : "\uD83D\uDCC1"}
        </span>
        <span className={styles.path}>{displayPath}</span>
        <span className={styles.editIcon}>{"\u270F"}</span>
      </button>

      {isOpen && (
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
            aria-labelledby="repo-modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 id="repo-modal-title" className={styles.title}>
                Select Repository
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

            <form onSubmit={handleSubmit} className={styles.content}>
              {error && <div className={styles.errorBanner}>{error}</div>}

              <div className={styles.formGroup}>
                <label htmlFor="repoPath" className={styles.label}>
                  Repository Path
                </label>
                <input
                  type="text"
                  id="repoPath"
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                  className={styles.input}
                  placeholder="/path/to/your/repository"
                  disabled={isLoading}
                />
                <span className={styles.hint}>
                  Enter the absolute path to your project directory.
                  A .pokeralph folder will be created if it doesn't exist.
                </span>
              </div>

              {currentWorkingDir && (
                <div className={styles.currentPath}>
                  <span className={styles.currentLabel}>Current:</span>
                  <code className={styles.currentValue}>{currentWorkingDir}</code>
                </div>
              )}

              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancel}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isLoading}
                >
                  {isLoading ? "Switching..." : "Switch Repository"}
                </button>
              </div>
            </form>
          </dialog>
        </div>
      )}
    </>
  );
}
