import { API_VERSION, DEFAULT_CLOUD_HOST } from "./constants.js";
import type { ClientOptions, ResolvedConfig } from "./types.js";

/**
 * Resolve client config from constructor args + env vars.
 *
 * Priority:
 *  1. Constructor args (baseUrl wins over tenantId)
 *  2. Environment variables
 *  3. Error if nothing found
 */
export function resolveConfig(opts?: ClientOptions): ResolvedConfig {
  const fetchFn = opts?.fetch ?? globalThis.fetch;

  // ── baseUrl mode (self-hosted or explicit Cloud URL) ──
  const baseUrl = opts?.baseUrl ?? process.env.KYOKA_BASE_URL;
  if (baseUrl) {
    return {
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey: opts?.apiKey ?? process.env.KYOKA_API_KEY,
      fetch: fetchFn,
    };
  }

  // ── tenantId mode (Cloud) ──
  const tenantId = opts?.tenantId ?? process.env.KYOKA_TENANT_ID;
  const apiKey = opts?.apiKey ?? process.env.KYOKA_API_KEY;

  if (tenantId) {
    if (!apiKey) {
      throw new Error(
        "Kyoka client: apiKey is required for Cloud mode. " +
          "Set apiKey in createClient() or KYOKA_API_KEY env var.",
      );
    }
    const host = process.env.KYOKA_CLOUD_HOST ?? DEFAULT_CLOUD_HOST;
    return {
      baseUrl: `${host.replace(/\/+$/, "")}/${API_VERSION}/t/${tenantId}`,
      apiKey,
      fetch: fetchFn,
    };
  }

  throw new Error(
    "Kyoka client: provide { tenantId, apiKey } for Cloud, " +
      "or { baseUrl } for self-hosted. " +
      "Env vars: KYOKA_TENANT_ID + KYOKA_API_KEY, or KYOKA_BASE_URL.",
  );
}
