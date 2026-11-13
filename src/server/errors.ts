import "server-only";
import type { FieldErrors } from "./types";

/**
 * Expected, user-facing failure of a data-layer operation (bad input, missing row, business rule).
 * `code` is a stable machine code; `fields` maps "path.to.field" → FieldErrorCode for forms.
 */
export class DataError extends Error {
  readonly code: string;
  readonly fields?: FieldErrors;
  constructor(code: string, fields?: FieldErrors, message?: string) {
    super(message ?? code);
    this.name = "DataError";
    this.code = code;
    this.fields = fields;
  }
}

export const isDataError = (e: unknown): e is DataError => e instanceof DataError;

/** Row not found (id / code / number). */
export class NotFoundError extends DataError {
  constructor(what: string) {
    super("not_found", undefined, `${what} not found`);
    this.name = "NotFoundError";
  }
}
