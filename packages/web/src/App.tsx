import { BrowserRouter, Routes, Route } from "react-router-dom";

function Dashboard() {
  return (
    <div>
      <h1>PokéRalph</h1>
      <p>Autonomous development orchestrator</p>
      <p>v0.1.0 - Wireframe Mode</p>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
