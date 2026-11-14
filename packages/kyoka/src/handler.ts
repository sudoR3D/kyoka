import * as admin from "./admin.js";
import { runCheck } from "./check.js";
import { applyBillingEvent } from "./events.js";
import { buildJwks, loadTokenContext } from "./token.js";
import type { BillingEventInput, KyokaInstance, KyokaOptions } from "./types.js";

function normalizeBasePath(basePath?: string): string {
  const raw = basePath ?? "/api/kyoka";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "error";
}

export function createHandler(options: KyokaOptions, instance: KyokaInstance) {
  const basePath = normalizeBasePath(options.basePath);

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    let path = url.pathname;

    if (path.startsWith(basePath)) {
      path = path.slice(basePath.length) || "/";
    }
    if (!path.startsWith("/")) path = `/${path}`;

    for (const plugin of options.plugins ?? []) {
      const routeHandler = plugin.routes?.[`${req.method} ${path}`];
      if (routeHandler) {
        return routeHandler(req, { instance });
      }
    }

    if (
      req.method === "GET" &&
      (path === "/v1/jwks" ||
        path === "/jwks" ||
        path === "/.well-known/jwks.json")
    ) {
      const ctx = await loadTokenContext(options);
      if (!ctx) {
        return json({ error: "jwks_not_configured" }, 503);
      }
      return json(await buildJwks(ctx));
    }

    if (req.method === "POST" && (path === "/v1/check" || path === "/check")) {
      let body: { subject?: string; feature?: string; used?: number };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      if (!body.subject || !body.feature) {
        return json({ error: "subject_and_feature_required" }, 400);
      }
      try {
        return json(
          await runCheck(options, {
            subject: body.subject,
            feature: body.feature,
            used: body.used,
          }),
        );
      } catch (err) {
        return json({ error: "check_failed", message: errorMessage(err) }, 500);
      }
    }

    if (req.method === "POST" && (path === "/v1/events" || path === "/events")) {
      let body: BillingEventInput;
      try {
        body = (await req.json()) as BillingEventInput;
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      try {
        return json(await applyBillingEvent(options, body), 200);
      } catch (err) {
        return json({ error: "event_failed", message: errorMessage(err) }, 400);
      }
    }

    // --- Admin ---
    if (path.startsWith("/v1/admin/") || path.startsWith("/admin/")) {
      const adminPath = path.replace(/^\/v1/, "").replace(/^\/admin/, "") || "/";
      // adminPath examples: /plans, /plans/free, /subjects/x, /aliases, /subjects/x/overrides/f

      try {
        if (req.method === "GET" && adminPath === "/plans") {
          return json(await admin.listPlans(options));
        }

        const planMatch = adminPath.match(/^\/plans\/([^/]+)$/);
        if (planMatch) {
          const slug = decodeURIComponent(planMatch[1]!);
          if (req.method === "GET") {
            const plan = await admin.getPlan(options, slug);
            return plan ? json(plan) : json({ error: "not_found" }, 404);
          }
          if (req.method === "PUT" || req.method === "POST") {
            const body = (await req.json()) as {
              features?: Record<string, unknown>;
            };
            return json(
              await admin.upsertPlan(options, {
                slug,
                features: (body.features ?? {}) as never,
              }),
            );
          }
          if (req.method === "DELETE") {
            const deleted = await admin.deletePlan(options, slug);
            return json({ deleted });
          }
        }

        if (
          (req.method === "POST" || req.method === "PUT") &&
          adminPath === "/plans"
        ) {
          const body = (await req.json()) as {
            slug?: string;
            features?: Record<string, unknown>;
          };
          if (!body.slug) return json({ error: "slug_required" }, 400);
          return json(
            await admin.upsertPlan(options, {
              slug: body.slug,
              features: (body.features ?? {}) as never,
            }),
          );
        }

        const subjectMatch = adminPath.match(/^\/subjects\/([^/]+)$/);
        if (req.method === "GET" && subjectMatch) {
          const id = decodeURIComponent(subjectMatch[1]!);
          const view = await admin.getSubject(options, id);
          return view ? json(view) : json({ error: "not_found" }, 404);
        }

        const overrideMatch = adminPath.match(
          /^\/subjects\/([^/]+)\/overrides\/([^/]+)$/,
        );
        if (overrideMatch) {
          const subject = decodeURIComponent(overrideMatch[1]!);
          const feature = decodeURIComponent(overrideMatch[2]!);
          if (req.method === "PUT" || req.method === "POST") {
            const body = (await req.json()) as {
              enabled?: boolean;
              limit?: number | null;
            };
            return json(
              await admin.setOverride(options, {
                subject,
                feature,
                enabled: body.enabled,
                limit: body.limit,
              }),
            );
          }
          if (req.method === "DELETE") {
            const cleared = await admin.clearOverride(options, {
              subject,
              feature,
            });
            return json({ cleared });
          }
        }

        if (adminPath === "/aliases") {
          if (req.method === "POST") {
            const body = (await req.json()) as {
              subject?: string;
              kind?: string;
              value?: string;
            };
            if (!body.subject || !body.kind || !body.value) {
              return json({ error: "subject_kind_value_required" }, 400);
            }
            return json(
              await admin.addAlias(options, {
                subject: body.subject,
                kind: body.kind,
                value: body.value,
              }),
            );
          }
          if (req.method === "DELETE") {
            const body = (await req.json()) as {
              kind?: string;
              value?: string;
            };
            if (!body.kind || !body.value) {
              return json({ error: "kind_value_required" }, 400);
            }
            const removed = await admin.removeAlias(options, {
              kind: body.kind,
              value: body.value,
            });
            return json({ removed });
          }
        }
      } catch (err) {
        const message = errorMessage(err);
        const status = message.includes('planStore "database"') ? 400 : 400;
        return json({ error: "admin_failed", message }, status);
      }
    }

    return json({ error: "not_found", path }, 404);
  };
}
