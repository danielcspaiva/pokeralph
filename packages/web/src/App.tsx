/**
 * Main App component for PokéRalph
 *
 * Sets up routing and wraps content in the main Layout.
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout.tsx";

/**
 * Placeholder Dashboard view (full implementation in Task 022)
 */
function Dashboard() {
  return (
    <div>
      <h2>Dashboard</h2>
      <p style={{ color: "#666", marginTop: "0.5rem" }}>
        Project overview coming in Task 022.
      </p>
    </div>
  );
}

/**
 * Placeholder Planning view (full implementation in Task 023)
 */
function Planning() {
  return (
    <div>
      <h2>Planning Mode</h2>
      <p style={{ color: "#666", marginTop: "0.5rem" }}>
        Planning interface coming in Task 023.
      </p>
    </div>
  );
}

/**
 * Placeholder Task Detail view (full implementation in Task 024-25)
 */
function TaskDetail() {
  return (
    <div>
      <h2>Task Detail</h2>
      <p style={{ color: "#666", marginTop: "0.5rem" }}>
        Task detail/battle view coming in Task 024-25.
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
          <Route path="/task/:taskId" element={<TaskDetail />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
