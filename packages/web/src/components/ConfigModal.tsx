/**
 * ConfigModal component for PokéRalph
 *
 * Placeholder modal for configuration settings.
 * Full implementation in Task 026.
 */

import styles from "./ConfigModal.module.css";

interface ConfigModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
}

/**
 * Configuration modal (placeholder - full implementation in Task 026)
 */
export function ConfigModal({ isOpen, onClose }: ConfigModalProps) {
  if (!isOpen) return null;

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdropButton}
        onClick={onClose}
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
          <h2 id="config-modal-title" className={styles.title}>Settings</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.content}>
          <p className={styles.placeholder}>
            Configuration options coming in Task 026.
          </p>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
