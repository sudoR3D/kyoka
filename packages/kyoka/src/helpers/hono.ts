import type { KyokaInstance } from "../types.js";

type HonoAppLike = {
  all: (path: string, handler: (c: { req: { raw: Request } }) => Response | Promise<Response>) => unknown;
};

/**
 * Mount Kyoka on a Hono app at `basePath/*` (default `/api/kyoka/*`).
 */
export function mountKyoka(
  app: HonoAppLike,
  instance: KyokaInstance,
  basePath = instance.options.basePath ?? "/api/kyoka",
): void {
  const prefix = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  app.all(`${prefix}/*`, (c) => instance.handler(c.req.raw));
  app.all(prefix, (c) => instance.handler(c.req.raw));
}
