import type { KyokaInstance } from "../types.js";

/**
 * Next.js App Router / Pages route helper — forwards the Request to Kyoka's handler.
 */
export function toNextHandler(instance: KyokaInstance) {
  return (req: Request) => instance.handler(req);
}
