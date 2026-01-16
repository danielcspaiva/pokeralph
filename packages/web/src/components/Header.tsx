/**
 * Header component for PokéRalph
 *
 * Displays project name, execution mode indicator, and config button.
 */

import { useState } from "react";
import { usePRD, useConfig, useIsConnected } from "@/stores/app-store.ts";
import { ConfigModal } from "./ConfigModal.tsx";
import { RepoSelector } from "./RepoSelector.tsx";
import styles from "./Header.module.css";

interface HeaderProps {
  /** Callback when menu button is clicked */
  onMenuClick: () => void;
  /** Whether sidebar is currently open */
  sidebarOpen: boolean;
}

/**
 * Application header with title, mode indicator, and config
 */
export function Header({ onMenuClick, sidebarOpen }: HeaderProps) {
  const prd = usePRD();
  const config = useConfig();
  const isConnected = useIsConnected();
  const [configOpen, setConfigOpen] = useState(false);

  const mode = config?.mode ?? "hitl";
  const projectName = prd?.name ?? "PokéRalph";

  return (
    <>
      <header className={styles.header}>
        <div className={styles.left}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={onMenuClick}
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          >
            <span className={styles.menuIcon}>☰</span>
          </button>
          <h1 className={styles.title}>{projectName}</h1>
        </div>

        <div className={styles.right}>
          <RepoSelector />

          <div
            className={`${styles.connectionStatus} ${isConnected ? styles.connected : styles.disconnected}`}
            title={isConnected ? "Connected to server" : "Disconnected"}
          >
            <span className={styles.connectionDot} />
            <span className={styles.connectionText}>
              {isConnected ? "Connected" : "Offline"}
            </span>
          </div>

          <div className={`${styles.modeBadge} ${styles[mode]}`}>
            {mode === "hitl" ? "HITL" : "YOLO"}
          </div>

          <button
            type="button"
            className={styles.configButton}
            onClick={() => setConfigOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <span className={styles.configIcon}>⚙</span>
          </button>
        </div>
      </header>

      <ConfigModal isOpen={configOpen} onClose={() => setConfigOpen(false)} />
    </>
  );
}
