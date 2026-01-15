/**
 * Custom error classes for PokéRalph services
 *
 * These errors provide specific error handling for file operations
 * and data validation throughout the application.
 */

/**
 * Error thrown when a required file is not found
 */
export class FileNotFoundError extends Error {
  /** The path to the file that was not found */
  readonly path: string;

  constructor(path: string, message?: string) {
    super(message ?? `File not found: ${path}`);
    this.name = "FileNotFoundError";
    this.path = path;
  }
}

/**
 * Error thrown when data validation fails
 */
export class ValidationError extends Error {
  /** The path to the file that failed validation */
  readonly path: string;
  /** Detailed validation errors */
  readonly errors: unknown;

  constructor(path: string, errors: unknown, message?: string) {
    super(message ?? `Validation failed for: ${path}`);
    this.name = "ValidationError";
    this.path = path;
    this.errors = errors;
  }
}
