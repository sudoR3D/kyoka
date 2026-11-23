import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveConfig } from "./config.js";

// Save original env vars so we can restore after each test
let savedEnv: Record<string, string | undefined>;

const ENV_KEYS = [
  "KYOKA_BASE_URL",
  "KYOKA_TENANT_ID",
  "KYOKA_API_KEY",
  "KYOKA_CLOUD_HOST",
];

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

const noopFetch = (() => {}) as unknown as typeof globalThis.fetch;

describe("resolveConfig", () => {
  test("cloud mode from constructor args", () => {
    const cfg = resolveConfig({
      tenantId: "ten_abc",
      apiKey: "kyo_live_x",
      fetch: noopFetch,
    });
    expect(cfg.baseUrl).toBe(
      "https://cloud.kyoka.sudored.xyz/v1/t/ten_abc",
    );
    expect(cfg.apiKey).toBe("kyo_live_x");
  });

  test("self-hosted mode from constructor args", () => {
    const cfg = resolveConfig({
      baseUrl: "http://localhost:8787/api/kyoka",
      fetch: noopFetch,
    });
    expect(cfg.baseUrl).toBe("http://localhost:8787/api/kyoka");
    expect(cfg.apiKey).toBeUndefined();
  });

  test("self-hosted with apiKey", () => {
    const cfg = resolveConfig({
      baseUrl: "http://localhost:8787/api/kyoka",
      apiKey: "kyo_live_y",
      fetch: noopFetch,
    });
    expect(cfg.baseUrl).toBe("http://localhost:8787/api/kyoka");
    expect(cfg.apiKey).toBe("kyo_live_y");
  });

  test("baseUrl wins over tenantId", () => {
    const cfg = resolveConfig({
      baseUrl: "http://custom",
      tenantId: "ten_x",
      apiKey: "k",
      fetch: noopFetch,
    });
    expect(cfg.baseUrl).toBe("http://custom");
  });

  test("env vars: KYOKA_TENANT_ID + KYOKA_API_KEY → cloud", () => {
    process.env.KYOKA_TENANT_ID = "ten_env";
    process.env.KYOKA_API_KEY = "kyo_live_env";
    const cfg = resolveConfig({ fetch: noopFetch });
    expect(cfg.baseUrl).toBe(
      "https://cloud.kyoka.sudored.xyz/v1/t/ten_env",
    );
    expect(cfg.apiKey).toBe("kyo_live_env");
  });

  test("env vars: KYOKA_BASE_URL → self-hosted", () => {
    process.env.KYOKA_BASE_URL = "http://envhost:9000/kyoka";
    const cfg = resolveConfig({ fetch: noopFetch });
    expect(cfg.baseUrl).toBe("http://envhost:9000/kyoka");
  });

  test("env KYOKA_API_KEY used for self-hosted when no constructor apiKey", () => {
    process.env.KYOKA_BASE_URL = "http://envhost:9000/kyoka";
    process.env.KYOKA_API_KEY = "kyo_live_fromenv";
    const cfg = resolveConfig({ fetch: noopFetch });
    expect(cfg.apiKey).toBe("kyo_live_fromenv");
  });

  test("KYOKA_CLOUD_HOST override", () => {
    process.env.KYOKA_CLOUD_HOST = "https://custom-cloud.example.com";
    const cfg = resolveConfig({
      tenantId: "ten_custom",
      apiKey: "k",
      fetch: noopFetch,
    });
    expect(cfg.baseUrl).toBe(
      "https://custom-cloud.example.com/v1/t/ten_custom",
    );
  });

  test("cloud without apiKey throws", () => {
    expect(() =>
      resolveConfig({ tenantId: "ten_x", fetch: noopFetch }),
    ).toThrow(/apiKey is required/);
  });

  test("no config at all throws", () => {
    expect(() => resolveConfig({ fetch: noopFetch })).toThrow(
      /provide.*tenantId.*or.*baseUrl/,
    );
  });

  test("trailing slashes stripped from baseUrl", () => {
    const cfg = resolveConfig({
      baseUrl: "http://x///",
      fetch: noopFetch,
    });
    expect(cfg.baseUrl).toBe("http://x");
  });

  test("trailing slashes stripped from KYOKA_CLOUD_HOST", () => {
    process.env.KYOKA_CLOUD_HOST = "https://host.com/";
    const cfg = resolveConfig({
      tenantId: "ten_t",
      apiKey: "k",
      fetch: noopFetch,
    });
    expect(cfg.baseUrl).toBe("https://host.com/v1/t/ten_t");
  });

  test("constructor args override env vars", () => {
    process.env.KYOKA_BASE_URL = "http://from-env";
    process.env.KYOKA_API_KEY = "kyo_env";
    const cfg = resolveConfig({
      baseUrl: "http://from-constructor",
      apiKey: "kyo_constructor",
      fetch: noopFetch,
    });
    expect(cfg.baseUrl).toBe("http://from-constructor");
    expect(cfg.apiKey).toBe("kyo_constructor");
  });

  test("KYOKA_BASE_URL env wins over KYOKA_TENANT_ID env", () => {
    process.env.KYOKA_BASE_URL = "http://self-hosted";
    process.env.KYOKA_TENANT_ID = "ten_ignored";
    process.env.KYOKA_API_KEY = "k";
    const cfg = resolveConfig({ fetch: noopFetch });
    expect(cfg.baseUrl).toBe("http://self-hosted");
  });
});
