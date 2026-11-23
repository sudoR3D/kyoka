import { API_VERSION } from "./constants.js";
import { KyokaApiError, KyokaNetworkError } from "./errors.js";
import type {
  AddAliasInput,
  AliasRecord,
  CheckInput,
  CheckResult,
  EnsureSubjectInput,
  EnsureSubjectResult,
  KyokaTokenClaims,
  OverrideRecord,
  PlanRecord,
  PushEventInput,
  PushEventResult,
  RemoveAliasInput,
  ResolvedConfig,
  SetOverrideInput,
  SubjectView,
  UpsertPlanInput,
} from "./types.js";
import { verifyToken } from "./verify.js";

export class KyokaClient {
  readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: ResolvedConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.fetchFn = config.fetch;
  }

  // ── Helpers ──

  private url(path: string): string {
    return `${this.baseUrl}/${API_VERSION}${path}`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.apiKey) {
      h["authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url(path), {
        method,
        headers: this.headers(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new KyokaNetworkError(
        `Kyoka client: ${method} ${path} failed`,
        err,
      );
    }

    if (!res.ok) {
      let code = `http_${res.status}`;
      let message: string | undefined;
      try {
        const errBody = (await res.json()) as {
          error?: string;
          message?: string;
        };
        if (errBody.error) code = errBody.error;
        message = errBody.message;
      } catch {
        /* non-JSON error body */
      }
      throw new KyokaApiError(res.status, code, message);
    }

    return (await res.json()) as T;
  }

  // ── Core ──

  async check(input: CheckInput): Promise<CheckResult> {
    return this.request("POST", "/check", input);
  }

  /**
   * Verify a Kyoka entitlement JWT against this instance's JWKS endpoint.
   * Uses cached JWKS — no API key needed for verification.
   */
  async verify(token: string, issuer?: string): Promise<KyokaTokenClaims> {
    const jwksUrl = `${this.baseUrl}/${API_VERSION}/jwks`;
    return verifyToken(token, jwksUrl, issuer);
  }

  // ── Subjects ──

  readonly subjects = {
    ensure: (input: EnsureSubjectInput): Promise<EnsureSubjectResult> =>
      this.request("POST", "/subjects", input),
  };

  // ── Events ──

  readonly events = {
    push: (input: PushEventInput): Promise<PushEventResult> =>
      this.request("POST", "/events", input),
  };

  // ── Admin ──

  readonly admin = {
    plans: {
      list: (): Promise<PlanRecord[]> => this.request("GET", "/admin/plans"),

      get: (slug: string): Promise<PlanRecord> =>
        this.request("GET", `/admin/plans/${encodeURIComponent(slug)}`),

      upsert: (input: UpsertPlanInput): Promise<PlanRecord> =>
        this.request("PUT", `/admin/plans/${encodeURIComponent(input.slug)}`, {
          features: input.features,
        }),

      delete: (slug: string): Promise<{ deleted: boolean }> =>
        this.request("DELETE", `/admin/plans/${encodeURIComponent(slug)}`),
    },

    subjects: {
      get: (subjectOrAlias: string): Promise<SubjectView> =>
        this.request(
          "GET",
          `/admin/subjects/${encodeURIComponent(subjectOrAlias)}`,
        ),

      setOverride: (input: SetOverrideInput): Promise<OverrideRecord> =>
        this.request(
          "PUT",
          `/admin/subjects/${encodeURIComponent(input.subject)}/overrides/${encodeURIComponent(input.feature)}`,
          {
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          },
        ),

      clearOverride: (input: {
        subject: string;
        feature: string;
      }): Promise<{ cleared: boolean }> =>
        this.request(
          "DELETE",
          `/admin/subjects/${encodeURIComponent(input.subject)}/overrides/${encodeURIComponent(input.feature)}`,
        ),
    },

    aliases: {
      add: (input: AddAliasInput): Promise<AliasRecord> =>
        this.request("POST", "/admin/aliases", input),

      remove: (input: RemoveAliasInput): Promise<{ removed: boolean }> =>
        this.request("DELETE", "/admin/aliases", input),
    },
  };
}
