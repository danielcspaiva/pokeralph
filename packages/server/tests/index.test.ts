import { test, expect, describe } from "bun:test";
import app from "../src/index.ts";

describe("@pokeralph/server", () => {
  test("health endpoint returns ok", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.version).toBe("0.1.0");
  });

  test("api endpoint returns message", async () => {
    const res = await app.fetch(new Request("http://localhost/api"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message).toBe("PokéRalph API v0.1.0");
  });
});
