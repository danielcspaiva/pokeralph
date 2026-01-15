import { test, expect, describe } from "bun:test";
import { VERSION, type Config } from "../src/index.ts";
import { DEFAULT_CONFIG } from "../src/types/index.ts";

describe("@pokeralph/core", () => {
  test("exports VERSION", () => {
    expect(VERSION).toBe("0.1.0");
  });

  test("DEFAULT_CONFIG has expected values", () => {
    expect(DEFAULT_CONFIG.maxIterationsPerTask).toBe(10);
    expect(DEFAULT_CONFIG.mode).toBe("hitl");
    expect(DEFAULT_CONFIG.feedbackLoops).toContain("test");
    expect(DEFAULT_CONFIG.autoCommit).toBe(true);
  });

  test("Config type is exported", () => {
    const config: Config = {
      maxIterationsPerTask: 5,
      mode: "yolo",
      feedbackLoops: ["test"],
      timeoutMinutes: 15,
      pollingIntervalMs: 1000,
      autoCommit: false,
    };
    expect(config.mode).toBe("yolo");
  });
});
