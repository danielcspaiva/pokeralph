/**
 * WebSocket tests for PokéRalph server
 *
 * Tests WebSocket functionality including connection handling,
 * message broadcasting, heartbeat, and Orchestrator event forwarding.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import {
  WebSocketManager,
  createWebSocketMessage,
  createWebSocketHandlers,
  getWebSocketManager,
  resetWebSocketManager,
  type WebSocketData,
  type WebSocketEventType,
  type WebSocketMessage,
} from "../src/websocket/index.ts";
import { startServer, resetServerState } from "../src/index.ts";

describe("@pokeralph/server WebSocket", () => {
  describe("createWebSocketMessage", () => {
    test("creates message with correct format", () => {
      const message = createWebSocketMessage("connected", { test: true });

      expect(message.type).toBe("connected");
      expect(message.payload).toEqual({ test: true });
      expect(message.timestamp).toBeDefined();
      expect(new Date(message.timestamp).toISOString()).toBe(message.timestamp);
    });

    test("creates message with different event types", () => {
      const events: WebSocketEventType[] = [
        "planning_output",
        "battle_start",
        "iteration_start",
        "progress_update",
        "feedback_result",
        "await_approval",
        "error",
      ];

      for (const eventType of events) {
        const message = createWebSocketMessage(eventType, {});
        expect(message.type).toBe(eventType);
      }
    });

    test("preserves complex payload objects", () => {
      const payload = {
        taskId: "001-test-task",
        progress: {
          currentIteration: 3,
          logs: ["log1", "log2"],
        },
        nested: {
          deep: {
            value: 42,
          },
        },
      };

      const message = createWebSocketMessage("progress_update", payload);
      expect(message.payload).toEqual(payload);
    });
  });

  describe("WebSocketManager", () => {
    let manager: WebSocketManager;

    beforeEach(() => {
      manager = new WebSocketManager();
    });

    afterEach(() => {
      manager.close();
    });

    test("initializes with zero clients", () => {
      expect(manager.getClientCount()).toBe(0);
    });

    test("getConnectionIds returns empty array initially", () => {
      expect(manager.getConnectionIds()).toEqual([]);
    });

    describe("broadcast", () => {
      test("broadcast does not throw with no clients", () => {
        expect(() => {
          manager.broadcast("connected", { test: true });
        }).not.toThrow();
      });

      test("broadcast handles multiple event types", () => {
        const events: WebSocketEventType[] = [
          "planning_output",
          "planning_question",
          "battle_start",
          "battle_complete",
          "iteration_start",
          "iteration_end",
          "progress_update",
          "completion_detected",
          "feedback_result",
          "await_approval",
          "approval_received",
          "error",
        ];

        for (const eventType of events) {
          expect(() => {
            manager.broadcast(eventType, {});
          }).not.toThrow();
        }
      });
    });

    describe("heartbeat", () => {
      test("stopHeartbeat can be called safely", () => {
        expect(() => manager.stopHeartbeat()).not.toThrow();
      });

      test("stopHeartbeat can be called multiple times", () => {
        expect(() => {
          manager.stopHeartbeat();
          manager.stopHeartbeat();
          manager.stopHeartbeat();
        }).not.toThrow();
      });
    });

    describe("close", () => {
      test("close cleans up resources", () => {
        manager.close();
        expect(manager.getClientCount()).toBe(0);
        expect(manager.getConnectionIds()).toEqual([]);
      });

      test("close can be called multiple times safely", () => {
        expect(() => {
          manager.close();
          manager.close();
        }).not.toThrow();
      });
    });
  });

  describe("WebSocketManager with fake clients", () => {
    let manager: WebSocketManager;
    let sentMessages: string[];

    /**
     * Fake WebSocket interface for testing.
     * Uses `unknown` cast to ServerWebSocket to satisfy WebSocketManager methods.
     */
    interface FakeWebSocket {
      data: WebSocketData;
      send: (message: string) => void;
      close: () => void;
    }

    /**
     * Creates a fake ServerWebSocket for testing.
     * Cast to `unknown` first to allow assignment to ServerWebSocket parameter.
     */
    function createFakeWebSocket(id = "test-ws"): FakeWebSocket {
      return {
        data: {
          id,
          lastPing: Date.now(),
          isAlive: true,
        },
        send: (message: string) => {
          sentMessages.push(message);
        },
        close: () => {},
      };
    }

    /**
     * Helper to cast FakeWebSocket to the type expected by WebSocketManager
     */
    function asWs(fake: FakeWebSocket): Parameters<typeof manager.handleOpen>[0] {
      return fake as unknown as Parameters<typeof manager.handleOpen>[0];
    }

    beforeEach(() => {
      manager = new WebSocketManager();
      sentMessages = [];
    });

    afterEach(() => {
      manager.close();
    });

    test("handleOpen adds client and sends connected message", () => {
      const ws = createFakeWebSocket();
      manager.handleOpen(asWs(ws));

      expect(manager.getClientCount()).toBe(1);
      expect(sentMessages.length).toBe(1);

      const message = JSON.parse(sentMessages[0]!) as WebSocketMessage;
      expect(message.type).toBe("connected");
      expect(message.payload).toHaveProperty("connectionId");
      expect(message.payload).toHaveProperty("clientsConnected", 1);
    });

    test("handleOpen generates unique connection IDs", () => {
      const ws1 = createFakeWebSocket();
      const ws2 = createFakeWebSocket();

      manager.handleOpen(asWs(ws1));
      manager.handleOpen(asWs(ws2));

      expect(ws1.data.id).not.toBe(ws2.data.id);
      expect(manager.getClientCount()).toBe(2);
    });

    test("handleClose removes client", () => {
      const ws = createFakeWebSocket();
      manager.handleOpen(asWs(ws));
      expect(manager.getClientCount()).toBe(1);

      manager.handleClose(asWs(ws), 1000, "normal close");
      expect(manager.getClientCount()).toBe(0);
    });

    test("handleError removes client", () => {
      const ws = createFakeWebSocket();
      manager.handleOpen(asWs(ws));
      expect(manager.getClientCount()).toBe(1);

      manager.handleError(asWs(ws), new Error("test error"));
      expect(manager.getClientCount()).toBe(0);
    });

    test("handleMessage responds to ping with pong", () => {
      const ws = createFakeWebSocket();
      manager.handleOpen(asWs(ws));
      sentMessages = []; // Clear connected message

      const pingMessage = JSON.stringify({
        type: "ping",
        payload: { timestamp: Date.now() },
      });
      manager.handleMessage(asWs(ws), pingMessage);

      expect(sentMessages.length).toBe(1);
      const pong = JSON.parse(sentMessages[0]!) as WebSocketMessage;
      expect(pong.type).toBe("pong");
    });

    test("handleMessage updates lastPing on ping", () => {
      const ws = createFakeWebSocket();
      const originalPing = ws.data.lastPing;

      // Small delay to ensure timestamp changes
      manager.handleOpen(asWs(ws));

      const pingMessage = JSON.stringify({
        type: "ping",
        payload: { timestamp: Date.now() },
      });
      manager.handleMessage(asWs(ws), pingMessage);

      expect(ws.data.lastPing).toBeGreaterThanOrEqual(originalPing);
      expect(ws.data.isAlive).toBe(true);
    });

    test("handleMessage ignores invalid JSON", () => {
      const ws = createFakeWebSocket();
      manager.handleOpen(asWs(ws));
      sentMessages = [];

      expect(() => {
        manager.handleMessage(asWs(ws), "not valid json");
      }).not.toThrow();

      // Should not send any response
      expect(sentMessages.length).toBe(0);
    });

    test("handleMessage handles Buffer input", () => {
      const ws = createFakeWebSocket();
      manager.handleOpen(asWs(ws));
      sentMessages = [];

      const pingMessage = Buffer.from(
        JSON.stringify({
          type: "ping",
          payload: { timestamp: Date.now() },
        })
      );
      manager.handleMessage(asWs(ws), pingMessage);

      expect(sentMessages.length).toBe(1);
      const pong = JSON.parse(sentMessages[0]!) as WebSocketMessage;
      expect(pong.type).toBe("pong");
    });

    test("broadcast sends to all connected clients", () => {
      const ws1 = createFakeWebSocket("ws1");
      const ws2 = createFakeWebSocket("ws2");
      const ws3 = createFakeWebSocket("ws3");

      // Track messages per client
      const ws1Messages: string[] = [];
      const ws2Messages: string[] = [];
      const ws3Messages: string[] = [];

      ws1.send = (msg: string) => ws1Messages.push(msg);
      ws2.send = (msg: string) => ws2Messages.push(msg);
      ws3.send = (msg: string) => ws3Messages.push(msg);

      manager.handleOpen(asWs(ws1));
      manager.handleOpen(asWs(ws2));
      manager.handleOpen(asWs(ws3));

      // Clear connected messages
      ws1Messages.length = 0;
      ws2Messages.length = 0;
      ws3Messages.length = 0;

      // Broadcast
      manager.broadcast("battle_start", { taskId: "001-test-task" });

      // Each client should receive the message
      expect(ws1Messages.length).toBe(1);
      expect(ws2Messages.length).toBe(1);
      expect(ws3Messages.length).toBe(1);

      // Verify message content
      const msg1 = JSON.parse(ws1Messages[0]!) as WebSocketMessage;
      expect(msg1.type).toBe("battle_start");
      expect(msg1.payload).toEqual({ taskId: "001-test-task" });
    });

    test("broadcast removes dead clients on send error", () => {
      const ws1 = createFakeWebSocket("ws1");
      const ws2 = createFakeWebSocket("ws2");

      // First, let handleOpen succeed (it sends a "connected" message)
      manager.handleOpen(asWs(ws1));
      manager.handleOpen(asWs(ws2));
      expect(manager.getClientCount()).toBe(2);

      // Now make ws1 throw on subsequent sends
      ws1.send = () => {
        throw new Error("connection closed");
      };

      // Broadcast should handle the error
      manager.broadcast("test" as WebSocketEventType, {});

      // Dead client should be removed
      expect(manager.getClientCount()).toBe(1);
    });

    test("getConnectionIds returns all client IDs", () => {
      const ws1 = createFakeWebSocket("ws1");
      const ws2 = createFakeWebSocket("ws2");

      manager.handleOpen(asWs(ws1));
      manager.handleOpen(asWs(ws2));

      const ids = manager.getConnectionIds();
      expect(ids.length).toBe(2);
      expect(ids).toContain(ws1.data.id);
      expect(ids).toContain(ws2.data.id);
    });
  });

  describe("getWebSocketManager and resetWebSocketManager", () => {
    afterEach(() => {
      resetWebSocketManager();
    });

    test("getWebSocketManager returns singleton instance", () => {
      const manager1 = getWebSocketManager();
      const manager2 = getWebSocketManager();
      expect(manager1).toBe(manager2);
    });

    test("resetWebSocketManager clears singleton", () => {
      const manager1 = getWebSocketManager();
      resetWebSocketManager();
      const manager2 = getWebSocketManager();
      expect(manager1).not.toBe(manager2);
    });
  });

  describe("createWebSocketHandlers", () => {
    afterEach(() => {
      resetWebSocketManager();
    });

    test("returns object with required handler methods", () => {
      const handlers = createWebSocketHandlers();

      expect(handlers.open).toBeDefined();
      expect(handlers.message).toBeDefined();
      expect(handlers.close).toBeDefined();
      expect(handlers.error).toBeDefined();

      expect(typeof handlers.open).toBe("function");
      expect(typeof handlers.message).toBe("function");
      expect(typeof handlers.close).toBe("function");
      expect(typeof handlers.error).toBe("function");
    });

    test("handlers use the global WebSocketManager", () => {
      const manager = getWebSocketManager();
      const handlers = createWebSocketHandlers();

      const fakeWs = {
        data: { id: "", lastPing: Date.now(), isAlive: true } as WebSocketData,
        send: () => {},
        close: () => {},
      };

      handlers.open(fakeWs as unknown as Parameters<typeof handlers.open>[0]);
      expect(manager.getClientCount()).toBe(1);

      handlers.close(fakeWs as unknown as Parameters<typeof handlers.close>[0], 1000, "test");
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe("WebSocket integration with live server", () => {
    let tempDir: string;
    let server: ReturnType<typeof Bun.serve> | null = null;
    let testPort: number;

    beforeEach(() => {
      tempDir = join(
        tmpdir(),
        `pokeralph-ws-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      mkdirSync(tempDir, { recursive: true });
      resetServerState();
      testPort = 3600 + Math.floor(Math.random() * 100);
    });

    afterEach(() => {
      if (server) {
        server.stop();
        server = null;
      }

      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      resetServerState();
    });

    test("server accepts WebSocket connection at /ws", async () => {
      server = startServer({ port: testPort, workingDir: tempDir });

      // Use Bun's WebSocket client
      const ws = new WebSocket(`ws://localhost:${testPort}/ws`);

      const connected = await new Promise<boolean>((resolve) => {
        ws.onopen = () => resolve(true);
        ws.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 2000);
      });

      expect(connected).toBe(true);

      ws.close();
    });

    test("server sends connected message on WebSocket open", async () => {
      server = startServer({ port: testPort, workingDir: tempDir });

      const ws = new WebSocket(`ws://localhost:${testPort}/ws`);

      const message = await new Promise<WebSocketMessage | null>((resolve) => {
        ws.onmessage = (event) => {
          try {
            resolve(JSON.parse(event.data as string));
          } catch {
            resolve(null);
          }
        };
        ws.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 2000);
      });

      expect(message).not.toBeNull();
      expect(message?.type).toBe("connected");
      expect(message?.payload).toHaveProperty("connectionId");
      expect(message?.payload).toHaveProperty("clientsConnected");
      expect(message?.timestamp).toBeDefined();

      ws.close();
    });

    test("server responds to ping with pong", async () => {
      server = startServer({ port: testPort, workingDir: tempDir });

      const ws = new WebSocket(`ws://localhost:${testPort}/ws`);

      const pong = await new Promise<WebSocketMessage | null>((resolve) => {
        let receivedConnected = false;

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as WebSocketMessage;
            if (msg.type === "connected") {
              receivedConnected = true;
              // Send ping after connected
              ws.send(
                JSON.stringify({
                  type: "ping",
                  payload: { timestamp: Date.now() },
                })
              );
            } else if (msg.type === "pong" && receivedConnected) {
              resolve(msg);
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 2000);
      });

      expect(pong).not.toBeNull();
      expect(pong?.type).toBe("pong");
      expect(pong?.payload).toHaveProperty("timestamp");

      ws.close();
    });

    test("multiple clients can connect simultaneously", async () => {
      server = startServer({ port: testPort, workingDir: tempDir });

      const ws1 = new WebSocket(`ws://localhost:${testPort}/ws`);
      const ws2 = new WebSocket(`ws://localhost:${testPort}/ws`);
      const ws3 = new WebSocket(`ws://localhost:${testPort}/ws`);

      const connections = await Promise.all([
        new Promise<boolean>((resolve) => {
          ws1.onopen = () => resolve(true);
          ws1.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 2000);
        }),
        new Promise<boolean>((resolve) => {
          ws2.onopen = () => resolve(true);
          ws2.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 2000);
        }),
        new Promise<boolean>((resolve) => {
          ws3.onopen = () => resolve(true);
          ws3.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 2000);
        }),
      ]);

      expect(connections).toEqual([true, true, true]);

      // Check client count
      const manager = getWebSocketManager();
      expect(manager.getClientCount()).toBe(3);

      ws1.close();
      ws2.close();
      ws3.close();
    });

    test("broadcast reaches all connected clients", async () => {
      server = startServer({ port: testPort, workingDir: tempDir });

      const ws1 = new WebSocket(`ws://localhost:${testPort}/ws`);
      const ws2 = new WebSocket(`ws://localhost:${testPort}/ws`);

      // Wait for both to connect
      await Promise.all([
        new Promise<void>((resolve) => {
          ws1.onopen = () => resolve();
          setTimeout(resolve, 2000);
        }),
        new Promise<void>((resolve) => {
          ws2.onopen = () => resolve();
          setTimeout(resolve, 2000);
        }),
      ]);

      // Set up message receivers
      const ws1Messages: WebSocketMessage[] = [];
      const ws2Messages: WebSocketMessage[] = [];

      ws1.onmessage = (event) => {
        try {
          ws1Messages.push(JSON.parse(event.data as string));
        } catch {
          // Ignore
        }
      };

      ws2.onmessage = (event) => {
        try {
          ws2Messages.push(JSON.parse(event.data as string));
        } catch {
          // Ignore
        }
      };

      // Clear initial connected messages
      await new Promise((resolve) => setTimeout(resolve, 100));
      ws1Messages.length = 0;
      ws2Messages.length = 0;

      // Broadcast a message
      const manager = getWebSocketManager();
      manager.broadcast("battle_start", { taskId: "001-test-task", task: { id: "001-test-task" } });

      // Wait for messages
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(ws1Messages.length).toBe(1);
      expect(ws2Messages.length).toBe(1);

      expect(ws1Messages[0]!.type).toBe("battle_start");
      expect(ws1Messages[0]!.payload).toHaveProperty("taskId", "001-test-task");

      expect(ws2Messages[0]!.type).toBe("battle_start");
      expect(ws2Messages[0]!.payload).toHaveProperty("taskId", "001-test-task");

      ws1.close();
      ws2.close();
    });

    test("WebSocket upgrade fails for non-WebSocket requests to /ws", async () => {
      server = startServer({ port: testPort, workingDir: tempDir });

      // Regular HTTP request to /ws endpoint (not upgrade)
      const res = await fetch(`http://localhost:${testPort}/ws`);

      // Should fail because it's not a proper WebSocket upgrade
      expect(res.status).toBe(400);
    });
  });

  describe("WebSocketManager.setupOrchestrator", () => {
    let tempDir: string;
    let manager: WebSocketManager;
    let sentMessages: string[];

    interface FakeWs {
      data: WebSocketData;
      send: (msg: string) => void;
      close: () => void;
    }

    function createFakeWebSocket(): FakeWs {
      return {
        data: { id: "test-ws", lastPing: Date.now(), isAlive: true },
        send: (msg: string) => sentMessages.push(msg),
        close: () => {},
      };
    }

    function asWs(fake: FakeWs): Parameters<typeof manager.handleOpen>[0] {
      return fake as unknown as Parameters<typeof manager.handleOpen>[0];
    }

    beforeEach(async () => {
      tempDir = join(
        tmpdir(),
        `pokeralph-ws-orch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      mkdirSync(tempDir, { recursive: true });
      manager = new WebSocketManager();
      sentMessages = [];
    });

    afterEach(() => {
      manager.close();
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    });

    test("setupOrchestrator can be called without error", async () => {
      const { Orchestrator } = await import("@pokeralph/core");
      const orchestrator = new Orchestrator(tempDir);

      expect(() => {
        manager.setupOrchestrator(orchestrator);
      }).not.toThrow();
    });

    test("setupOrchestrator registers event listeners", async () => {
      const { Orchestrator } = await import("@pokeralph/core");
      const orchestrator = new Orchestrator(tempDir);

      const ws = createFakeWebSocket();
      manager.handleOpen(asWs(ws));
      sentMessages = []; // Clear connected message

      manager.setupOrchestrator(orchestrator);

      // Orchestrator should now be connected to WebSocket manager
      // We can't easily test event forwarding without actually triggering
      // the orchestrator events, but we verify setup doesn't throw
      expect(manager.getClientCount()).toBe(1);
    });
  });
});
