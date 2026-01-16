/**
 * Main layout component for PokéRalph
 *
 * Provides a responsive layout with sidebar and main content area.
 * Sidebar collapses on mobile devices.
 */

import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar.tsx";
import { Header } from "./Header.tsx";
import { connect, setupWebSocketListeners, useAppStore } from "@/stores";
import { getPRD } from "@/api/client.ts";
import styles from "./Layout.module.css";

interface LayoutProps {
  /** Main content to render */
  children: ReactNode;
}

/**
 * Main application layout with sidebar navigation and header
 */
export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const setPRD = useAppStore((state) => state.setPRD);

  // Initialize WebSocket connection and load PRD on mount
  useEffect(() => {
    console.log("[PokéRalph][Layout] Initializing WebSocket connection...");
    connect();
    const cleanup = setupWebSocketListeners();

    // Load PRD if not already in store
    async function loadPRD() {
      console.log("[PokéRalph][Layout] Loading PRD...");
      try {
        const prd = await getPRD();
        console.log("[PokéRalph][Layout] PRD loaded:", prd?.name);
        setPRD(prd);
      } catch (err) {
        console.log("[PokéRalph][Layout] No PRD found:", err);
        // PRD might not exist yet - that's okay
      }
    }
    loadPRD();

    return () => {
      console.log("[PokéRalph][Layout] Cleaning up WebSocket...");
      cleanup();
    };
  }, [setPRD]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className={styles.layout}>
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <div className={styles.mainArea}>
        <Header onMenuClick={toggleSidebar} sidebarOpen={sidebarOpen} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
