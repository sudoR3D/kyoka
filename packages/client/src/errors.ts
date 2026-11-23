/**
 * Thrown when the Kyoka API returns a non-2xx response with an error body.
 */
export class KyokaApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "KyokaApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Thrown when the HTTP request itself fails (network error, DNS, timeout).
 */
export class KyokaNetworkError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "KyokaNetworkError";
    this.cause = cause;
  }
}
