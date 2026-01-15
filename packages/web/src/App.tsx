/**
 * Main App component for PokéRalph
 *
 * Sets up routing and wraps content in the main Layout.
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout.tsx";
import { Dashboard, Planning, Battle } from "@/views/index.ts";

/**
 * Placeholder History view (full implementation in Task 025)
 */
function History() {
  return (
    <div>
      <h2>Task History</h2>
      <p style={{ color: "#666", marginTop: "0.5rem" }}>
        Task history view coming in Task 025.
      </p>
    </div>
  );
}

/**
 * Main application component with routing
 */
export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/task/:taskId" element={<Battle />} />
          <Route path="/history/:taskId" element={<History />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
