/**
 * Error handling middleware
 *
 * Catches errors thrown during request handling and returns
 * consistent JSON error responses.
 */

import type { Context, Next } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Standard error response shape
 */
export interface ErrorResponse {
  error: string;
  message: string;
  status: number;
  timestamp: string;
}

/**
 * Application error with HTTP status code
 */
export class AppError extends Error {
  constructor(
    message: string,
    public status: ContentfulStatusCode = 500,
    public code = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Creates an error response object
 */
function createErrorResponse(
  status: number,
  code: string,
  message: string
): ErrorResponse {
  return {
    error: code,
    message,
    status,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Error handling middleware
 *
 * Catches all errors and returns consistent JSON responses.
 * Logs errors to console for debugging.
 */
export async function errorHandler(c: Context, next: Next): Promise<Response | undefined> {
  try {
    await next();
  } catch (err) {
    // Handle known application errors
    if (err instanceof AppError) {
      console.error(`[AppError] ${err.code}: ${err.message}`);
      return c.json(createErrorResponse(err.status, err.code, err.message), err.status);
    }

    // Handle Zod validation errors (from @pokeralph/core)
    if (err && typeof err === "object" && "issues" in err) {
      const zodError = err as { issues: Array<{ message: string; path: (string | number)[] }> };
      const message = zodError.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      console.error(`[ValidationError] ${message}`);
      return c.json(createErrorResponse(400, "VALIDATION_ERROR", message), 400);
    }

    // Handle standard errors
    if (err instanceof Error) {
      console.error(`[Error] ${err.name}: ${err.message}`);
      console.error(err.stack);
      return c.json(
        createErrorResponse(500, "INTERNAL_ERROR", err.message),
        500
      );
    }

    // Handle unknown errors
    console.error("[Error] Unknown error:", err);
    return c.json(
      createErrorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred"),
      500
    );
  }
}

/**
 * Not found handler for unmatched routes
 */
export function notFoundHandler(c: Context): Response {
  return c.json(
    createErrorResponse(404, "NOT_FOUND", `Route not found: ${c.req.method} ${c.req.path}`),
    404
  );
}
