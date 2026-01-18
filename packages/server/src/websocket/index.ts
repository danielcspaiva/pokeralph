/**
 * WebSocket handler for PokéRalph
 *
 * Handles WebSocket connections and broadcasts Orchestrator events
 * to all connected clients in real-time.
 */

import type { ServerWebSocket } from "bun";

// Strategic logging helper
const log = (action: string, data?: unknown) => {
  console.log(`[PokéRalph][WebSocket] ${action}`, data ? JSON.stringify(data, null, 2) : "");
};
import type { Orchestrator } from "@pokeralph/core";

/**
 * WebSocket event types that are broadcast to clients
 */
export type WebSocketEventType =
  // Planning events
  | "planning_output"
  | "planning_question"
  | "planning_completed"
  | "planning_keepalive"
  // Battle events
  | "battle_start"
  | "battle_pause"
  | "battle_resume"
  | "battle_cancel"
  | "battle_complete"
  | "battle_failed"
  // Iteration events
  | "iteration_start"
  | "iteration_end"
  | "iteration_output"
  // Progress events
  | "progress_update"
  | "completion_detected"
  // Feedback events
  | "feedback_result"
  // Approval events (HITL)
  | "await_approval"
  | "approval_received"
  // Repository events
  | "repo_changed"
  // System events
  | "error"
  | "connected"
  | "pong";

/**
 * WebSocket message format sent to clients
 */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketEventType;
  payload: T;
  timestamp: string;
}

/**
 * Custom data attached to each WebSocket connection
 */
export interface WebSocketData {
  /** Unique connection ID */
  id: string;
  /** Timestamp of last ping received */
  lastPing: number;
  /** Whether the connection is alive (responded to heartbeat) */
  isAlive: boolean;
}

/**
 * Creates a WebSocket message with timestamp
 */
export function createWebSocketMessage<T>(
  type: WebSocketEventType,
  payload: T
): WebSocketMessage<T> {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generates a unique connection ID
 */
function generateConnectionId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * WebSocket manager for handling connections and broadcasting events
 */
export class WebSocketManager {
  /** All connected WebSocket clients */
  private readonly clients = new Set<ServerWebSocket<WebSocketData>>();

  /** Heartbeat interval ID */
  private heartbeatInterval: Timer | null = null;

  /** Heartbeat interval in milliseconds (30 seconds) */
  private readonly heartbeatIntervalMs = 30000;

  /** Connection timeout in milliseconds (600 seconds / 10 min - longer for Claude planning responses) */
  private readonly connectionTimeoutMs = 600000;

  /** Orchestrator reference for event listening */
  private orchestrator: Orchestrator | null = null;

  /**
   * Creates a new WebSocketManager
   */
  constructor() {
    // Start heartbeat when manager is created
    this.startHeartbeat();
  }

  /**
   * Sets up the Orchestrator and registers event listeners
   */
  setupOrchestrator(orchestrator: Orchestrator): void {
    this.orchestrator = orchestrator;

    // Register planning event listeners
    orchestrator.onPlanningOutput(({ output }) => {
      this.broadcast("planning_output", { output });
    });

    orchestrator.onPlanningQuestion(({ question }) => {
      this.broadcast("planning_question", { question });
    });

    orchestrator.onPlanningKeepalive(({ timestamp, state }) => {
      this.broadcast("planning_keepalive", { timestamp, state });
    });

    // Register battle event listeners
    orchestrator.onBattleEvent("battle_start", ({ taskId, task }) => {
      this.broadcast("battle_start", { taskId, task });
    });

    orchestrator.onBattleEvent("battle_pause", ({ taskId, iteration }) => {
      this.broadcast("battle_pause", { taskId, iteration });
    });

    orchestrator.onBattleEvent("battle_resume", ({ taskId }) => {
      this.broadcast("battle_resume", { taskId });
    });

    orchestrator.onBattleEvent("battle_cancel", ({ taskId, reason }) => {
      this.broadcast("battle_cancel", { taskId, reason });
    });

    orchestrator.onBattleEvent("battle_complete", ({ taskId, battle }) => {
      this.broadcast("battle_complete", { taskId, battle });
    });

    orchestrator.onBattleEvent("battle_failed", ({ taskId, error, battle }) => {
      this.broadcast("battle_failed", { taskId, error, battle });
    });

    // Register iteration event listeners
    orchestrator.onBattleEvent("iteration_start", ({ taskId, iteration }) => {
      this.broadcast("iteration_start", { taskId, iteration });
    });

    orchestrator.onBattleEvent("iteration_end", ({ taskId, iteration, result }) => {
      this.broadcast("iteration_end", { taskId, iteration, result });
    });

    orchestrator.onBattleEvent("iteration_output", ({ taskId, iteration, output }) => {
      this.broadcast("iteration_output", { taskId, iteration, output });
    });

    // Register progress event listeners
    orchestrator.onBattleEvent("progress_update", ({ taskId, progress }) => {
      this.broadcast("progress_update", { taskId, progress });
    });

    orchestrator.onBattleEvent("completion_detected", ({ taskId }) => {
      this.broadcast("completion_detected", { taskId });
    });

    // Register feedback event listeners
    orchestrator.onBattleEvent("feedback_result", ({ taskId, loop, result }) => {
      this.broadcast("feedback_result", { taskId, loop, result });
    });

    // Register approval event listeners (HITL)
    orchestrator.onBattleEvent("await_approval", ({ taskId, iteration, summary }) => {
      this.broadcast("await_approval", { taskId, iteration, summary });
    });

    orchestrator.onBattleEvent("approval_received", ({ taskId, approved }) => {
      this.broadcast("approval_received", { taskId, approved });
    });

    // Register error event listener
    orchestrator.onBattleEvent("error", ({ message, code, details }) => {
      this.broadcast("error", { message, code, details });
    });
  }

  /**
   * Handles a new WebSocket connection
   */
  handleOpen(ws: ServerWebSocket<WebSocketData>): void {
    // Initialize connection data
    ws.data = {
      id: generateConnectionId(),
      lastPing: Date.now(),
      isAlive: true,
    };

    // Add to clients set
    this.clients.add(ws);

    console.log(`[WebSocket] Client connected: ${ws.data.id} (${this.clients.size} total)`);

    // Send connected message
    const message = createWebSocketMessage("connected", {
      connectionId: ws.data.id,
      clientsConnected: this.clients.size,
    });
    ws.send(JSON.stringify(message));
  }

  /**
   * Handles a WebSocket message
   */
  handleMessage(ws: ServerWebSocket<WebSocketData>, message: string | Buffer): void {
    try {
      const data = typeof message === "string" ? message : message.toString();
      const parsed = JSON.parse(data);

      // Handle ping messages for heartbeat
      if (parsed.type === "ping") {
        ws.data.lastPing = Date.now();
        ws.data.isAlive = true;
        const pongMessage = createWebSocketMessage("pong", { timestamp: parsed.payload?.timestamp });
        ws.send(JSON.stringify(pongMessage));
      }
    } catch {
      // Ignore invalid messages
      console.warn(`[WebSocket] Invalid message from ${ws.data.id}`);
    }
  }

  /**
   * Handles a WebSocket close event
   */
  handleClose(ws: ServerWebSocket<WebSocketData>, code: number, reason: string): void {
    this.clients.delete(ws);
    console.log(
      `[WebSocket] Client disconnected: ${ws.data.id} (code: ${code}, reason: ${reason || "none"}, ${this.clients.size} remaining)`
    );
  }

  /**
   * Handles a WebSocket error
   */
  handleError(ws: ServerWebSocket<WebSocketData>, error: Error): void {
    console.error(`[WebSocket] Error for client ${ws.data.id}:`, error.message);
    this.clients.delete(ws);
  }

  /**
   * Broadcasts a message to all connected clients
   */
  broadcast<T>(type: WebSocketEventType, payload: T): void {
    const message = createWebSocketMessage(type, payload);
    const messageStr = JSON.stringify(message);

    // Log broadcasts (summarize large payloads)
    const logPayload = type === "iteration_output" || type === "planning_output"
      ? { output: `${String((payload as { output?: string }).output ?? "").substring(0, 100)}...` }
      : payload;
    log(`Broadcasting: ${type}`, { clientCount: this.clients.size, payload: logPayload });

    for (const client of this.clients) {
      try {
        client.send(messageStr);
      } catch (error) {
        console.error(`[WebSocket] Failed to send to ${client.data.id}:`, error);
        // Remove dead connections
        this.clients.delete(client);
      }
    }
  }

  /**
   * Starts the heartbeat interval to detect dead connections
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const client of this.clients) {
        // Check if client has responded to recent heartbeat
        const timeSinceLastPing = now - client.data.lastPing;

        if (timeSinceLastPing > this.connectionTimeoutMs) {
          // Client hasn't responded, consider dead
          console.log(`[WebSocket] Client ${client.data.id} timed out, closing connection`);
          try {
            client.close(1000, "Connection timeout");
          } catch {
            // Connection may already be closed
          }
          this.clients.delete(client);
        }
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stops the heartbeat interval
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Gets the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Gets all connection IDs
   */
  getConnectionIds(): string[] {
    return Array.from(this.clients).map((c) => c.data.id);
  }

  /**
   * Closes all connections and cleans up
   */
  close(): void {
    this.stopHeartbeat();

    for (const client of this.clients) {
      try {
        client.close(1000, "Server shutting down");
      } catch {
        // Connection may already be closed
      }
    }

    this.clients.clear();
    this.orchestrator = null;
  }

  /**
   * Resets the orchestrator with a new instance
   *
   * @remarks
   * Use this when switching repositories. Clears old event listeners
   * and sets up new ones with the new orchestrator.
   */
  resetOrchestrator(newOrchestrator: Orchestrator): void {
    // Clear reference to old orchestrator (event listeners will be garbage collected
    // when the old orchestrator is discarded)
    this.orchestrator = null;

    // Setup new orchestrator with fresh event listeners
    this.setupOrchestrator(newOrchestrator);

    // Broadcast repo_changed event to all clients
    this.broadcast("repo_changed", {
      workingDir: newOrchestrator.getWorkingDir(),
    });
  }
}

// Global WebSocket manager instance
let wsManager: WebSocketManager | null = null;

/**
 * Gets or creates the global WebSocketManager instance
 */
export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}

/**
 * Resets the global WebSocketManager (for testing)
 */
export function resetWebSocketManager(): void {
  if (wsManager) {
    wsManager.close();
    wsManager = null;
  }
}

/**
 * Creates the WebSocket handlers for Bun.serve
 */
export function createWebSocketHandlers() {
  const manager = getWebSocketManager();

  return {
    open(ws: ServerWebSocket<WebSocketData>) {
      manager.handleOpen(ws);
    },
    message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
      manager.handleMessage(ws, message);
    },
    close(ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
      manager.handleClose(ws, code, reason);
    },
    error(ws: ServerWebSocket<WebSocketData>, error: Error) {
      manager.handleError(ws, error);
    },
  };
}
