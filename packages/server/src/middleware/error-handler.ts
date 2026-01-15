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
/**
 * Type guard to check if error is an AppError (duck typing for cross-module compatibility)
 */
function isAppError(err: unknown): err is AppError {
  if (err instanceof AppError) {
    return true;
  }
  // Fallback: check by name and properties for cross-module compatibility
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    err.name === "AppError" &&
    "status" in err &&
    "code" in err &&
    "message" in err
  ) {
    return true;
  }
  return false;
}

/**
 * Global error handler for Hono app.onError
 *
 * Use this with app.onError(globalErrorHandler) to catch all errors.
 */
export function globalErrorHandler(err: Error, c: Context): Response {
  // Handle known application errors
  if (isAppError(err)) {
    console.error(`[AppError] ${err.code}: ${err.message}`);
    return c.json(
      createErrorResponse(err.status, err.code, err.message),
      err.status as ContentfulStatusCode
    );
  }

  // Handle Zod validation errors (from @pokeralph/core)
  if (err && typeof err === "object" && "issues" in err) {
    const zodError = err as unknown as { issues: Array<{ message: string; path: (string | number)[] }> };
    const message = zodError.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    console.error(`[ValidationError] ${message}`);
    return c.json(createErrorResponse(400, "VALIDATION_ERROR", message), 400);
  }

  // Handle standard errors
  console.error(`[Error] ${err.name}: ${err.message}`);
  console.error(err.stack);
  return c.json(
    createErrorResponse(500, "INTERNAL_ERROR", err.message),
    500
  );
}

/**
 * Error handling middleware (placeholder for future use)
 *
 * Note: Hono's internal error handling catches errors from async handlers
 * before they propagate to middleware try/catch blocks. Use app.onError()
 * with globalErrorHandler instead for catching thrown errors.
 */
export async function errorHandler(_c: Context, next: Next): Promise<void> {
  await next();
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
