/**
 * Main App component for PokéRalph
 *
 * Sets up routing and wraps content in the main Layout.
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout.tsx";
import { Dashboard, Planning, Battle, History, Onboarding } from "@/views/index.ts";

/**
 * Main application component with routing
 */
export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/task/:taskId" element={<Battle />} />
          <Route path="/history/:taskId" element={<History />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
