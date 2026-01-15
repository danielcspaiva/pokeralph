/**
 * WebSocket client for PokéRalph
 *
 * Handles real-time communication with the server for live updates.
 * Features automatic reconnection, heartbeat, and typed event handling.
 */

import type { Progress, Battle, Task, FeedbackResult } from "@pokeralph/core";

// ==========================================================================
// WebSocket Event Types
// ==========================================================================

/**
 * All possible WebSocket event types from the server
 */
export type WebSocketEventType =
  // Connection events
  | "connected"
  | "pong"
  // Planning events
  | "planning_output"
  | "planning_question"
  | "planning_completed"
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
  // System events
  | "error";

/**
 * WebSocket message format from the server
 */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketEventType;
  payload: T;
  timestamp: string;
}

// ==========================================================================
// Event Payload Types
// ==========================================================================

/** Connected event payload */
export interface ConnectedPayload {
  connectionId: string;
  clientsConnected: number;
}

/** Planning output payload */
export interface PlanningOutputPayload {
  output: string;
}

/** Planning question payload */
export interface PlanningQuestionPayload {
  question: string;
}

/** Battle start payload */
export interface BattleStartPayload {
  taskId: string;
  task: Task;
}

/** Battle pause payload */
export interface BattlePausePayload {
  taskId: string;
  iteration: number;
}

/** Battle resume payload */
export interface BattleResumePayload {
  taskId: string;
}

/** Battle cancel payload */
export interface BattleCancelPayload {
  taskId: string;
  reason?: string;
}

/** Battle complete payload */
export interface BattleCompletePayload {
  taskId: string;
  battle: Battle;
}

/** Battle failed payload */
export interface BattleFailedPayload {
  taskId: string;
  error: string;
  battle: Battle;
}

/** Iteration start payload */
export interface IterationStartPayload {
  taskId: string;
  iteration: number;
}

/** Iteration end payload */
export interface IterationEndPayload {
  taskId: string;
  iteration: number;
  result: "success" | "failure";
}

/** Iteration output payload */
export interface IterationOutputPayload {
  taskId: string;
  iteration: number;
  output: string;
}

/** Progress update payload */
export interface ProgressUpdatePayload {
  taskId: string;
  progress: Progress;
}

/** Completion detected payload */
export interface CompletionDetectedPayload {
  taskId: string;
}

/** Feedback result payload */
export interface FeedbackResultPayload {
  taskId: string;
  loop: string;
  result: FeedbackResult;
}

/** Await approval payload */
export interface AwaitApprovalPayload {
  taskId: string;
  iteration: number;
  summary: string;
}

/** Approval received payload */
export interface ApprovalReceivedPayload {
  taskId: string;
  approved: boolean;
}

/** Error payload */
export interface ErrorPayload {
  message: string;
  code?: string;
  details?: unknown;
}

// ==========================================================================
// Event Listener Types
// ==========================================================================

/** Map of event types to their payload types */
export interface WebSocketEventPayloads {
  connected: ConnectedPayload;
  pong: { timestamp?: string };
  planning_output: PlanningOutputPayload;
  planning_question: PlanningQuestionPayload;
  planning_completed: Record<string, never>;
  battle_start: BattleStartPayload;
  battle_pause: BattlePausePayload;
  battle_resume: BattleResumePayload;
  battle_cancel: BattleCancelPayload;
  battle_complete: BattleCompletePayload;
  battle_failed: BattleFailedPayload;
  iteration_start: IterationStartPayload;
  iteration_end: IterationEndPayload;
  iteration_output: IterationOutputPayload;
  progress_update: ProgressUpdatePayload;
  completion_detected: CompletionDetectedPayload;
  feedback_result: FeedbackResultPayload;
  await_approval: AwaitApprovalPayload;
  approval_received: ApprovalReceivedPayload;
  error: ErrorPayload;
}

/** Event listener callback type */
export type WebSocketEventListener<T extends WebSocketEventType> = (
  payload: WebSocketEventPayloads[T],
  timestamp: string
) => void;

// ==========================================================================
// WebSocket Client
// ==========================================================================

/** WebSocket connection state */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

/** WebSocket client options */
export interface WebSocketClientOptions {
  /** WebSocket URL (default: uses window.location to build ws:// URL) */
  url?: string;
  /** Enable automatic reconnection (default: true) */
  autoReconnect?: boolean;
  /** Reconnection delay in milliseconds (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Heartbeat interval in milliseconds (default: 25000) */
  heartbeatInterval?: number;
}

/**
 * WebSocket client for PokéRalph
 *
 * Handles connection management, automatic reconnection,
 * heartbeat, and typed event handling.
 *
 * @example
 * ```ts
 * const ws = new WebSocketClient();
 *
 * ws.on("progress_update", (payload) => {
 *   console.log("Progress:", payload.progress);
 * });
 *
 * ws.on("battle_complete", (payload) => {
 *   console.log("Battle completed:", payload.taskId);
 * });
 *
 * ws.connect();
 * ```
 */
export class WebSocketClient {
  private socket: WebSocket | null = null;
  private listeners: Map<WebSocketEventType, Set<WebSocketEventListener<WebSocketEventType>>> =
    new Map();
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionId: string | null = null;

  private readonly options: Required<WebSocketClientOptions>;

  constructor(options: WebSocketClientOptions = {}) {
    this.options = {
      url: options.url ?? this.getDefaultUrl(),
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      heartbeatInterval: options.heartbeatInterval ?? 25000,
    };
  }

  /**
   * Gets the default WebSocket URL based on current location
   */
  private getDefaultUrl(): string {
    if (typeof window === "undefined") {
      return "ws://localhost:3456/ws";
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }

  /**
   * Gets the current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Gets the connection ID assigned by the server
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  /**
   * Checks if currently connected
   */
  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  /**
   * Establishes WebSocket connection
   */
  connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.connectionState = "connecting";
    this.socket = new WebSocket(this.options.url);

    this.socket.onopen = () => {
      this.connectionState = "connected";
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    this.socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.socket.onclose = (event) => {
      this.handleClose(event);
    };

    this.socket.onerror = () => {
      // Error events don't have useful info, wait for close
    };
  }

  /**
   * Closes the WebSocket connection
   */
  disconnect(): void {
    this.options.autoReconnect = false;
    this.cleanup();
    this.connectionState = "disconnected";
    this.connectionId = null;
  }

  /**
   * Registers an event listener
   */
  on<T extends WebSocketEventType>(
    event: T,
    callback: WebSocketEventListener<T>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as WebSocketEventListener<WebSocketEventType>);
  }

  /**
   * Removes an event listener
   */
  off<T extends WebSocketEventType>(
    event: T,
    callback: WebSocketEventListener<T>
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback as WebSocketEventListener<WebSocketEventType>);
    }
  }

  /**
   * Removes all listeners for an event (or all events if no event specified)
   */
  removeAllListeners(event?: WebSocketEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Handles incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);

      // Handle connected event specially to store connection ID
      if (message.type === "connected") {
        const payload = message.payload as ConnectedPayload;
        this.connectionId = payload.connectionId;
      }

      // Emit to all listeners for this event type
      const eventListeners = this.listeners.get(message.type);
      if (eventListeners) {
        for (const listener of eventListeners) {
          try {
            // Cast payload to the expected type for the listener
            listener(
              message.payload as WebSocketEventPayloads[WebSocketEventType],
              message.timestamp
            );
          } catch (error) {
            console.error(
              `[WebSocket] Error in listener for ${message.type}:`,
              error
            );
          }
        }
      }
    } catch (error) {
      console.error("[WebSocket] Failed to parse message:", error);
    }
  }

  /**
   * Handles WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    this.cleanup();
    this.connectionId = null;

    // Only reconnect if it wasn't a clean close
    if (this.options.autoReconnect && event.code !== 1000) {
      this.scheduleReconnect();
    } else {
      this.connectionState = "disconnected";
    }
  }

  /**
   * Schedules a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error("[WebSocket] Max reconnection attempts reached");
      this.connectionState = "disconnected";
      return;
    }

    this.connectionState = "reconnecting";
    this.reconnectAttempts++;

    const delay = this.options.reconnectDelay * 2 ** (this.reconnectAttempts - 1);
    console.log(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Starts the heartbeat interval
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        const pingMessage = JSON.stringify({
          type: "ping",
          payload: { timestamp: new Date().toISOString() },
        });
        this.socket.send(pingMessage);
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Stops the heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Cleans up connection resources
   */
  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.close(1000, "Client disconnect");
      }
      this.socket = null;
    }
  }
}

// ==========================================================================
// Singleton Instance
// ==========================================================================

let wsClient: WebSocketClient | null = null;

/**
 * Gets or creates the global WebSocket client instance
 */
export function getWebSocketClient(
  options?: WebSocketClientOptions
): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient(options);
  }
  return wsClient;
}

/**
 * Resets the global WebSocket client (for testing)
 */
export function resetWebSocketClient(): void {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}

// ==========================================================================
// Convenience Functions
// ==========================================================================

/**
 * Connects the global WebSocket client
 */
export function connect(options?: WebSocketClientOptions): void {
  getWebSocketClient(options).connect();
}

/**
 * Disconnects the global WebSocket client
 */
export function disconnect(): void {
  if (wsClient) {
    wsClient.disconnect();
  }
}

/**
 * Registers a listener on the global WebSocket client
 */
export function on<T extends WebSocketEventType>(
  event: T,
  callback: WebSocketEventListener<T>
): void {
  getWebSocketClient().on(event, callback);
}

/**
 * Removes a listener from the global WebSocket client
 */
export function off<T extends WebSocketEventType>(
  event: T,
  callback: WebSocketEventListener<T>
): void {
  if (wsClient) {
    wsClient.off(event, callback);
  }
}
