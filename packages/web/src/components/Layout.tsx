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
import { connect, setupWebSocketListeners } from "@/stores";
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

  // Initialize WebSocket connection on mount
  useEffect(() => {
    console.log("[PokéRalph][Layout] Initializing WebSocket connection...");
    connect();
    const cleanup = setupWebSocketListeners();
    return () => {
      console.log("[PokéRalph][Layout] Cleaning up WebSocket...");
      cleanup();
    };
  }, []);

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
