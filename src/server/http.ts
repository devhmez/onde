import "server-only";
// Small helpers shared by the Route Handlers in src/app/api/** and src/app/t/**.
import { isDataError } from "./errors";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

export class BodyError extends Error {
  constructor(readonly status: 400 | 413 | 415) {
    super(status === 413 ? "payload_too_large" : "invalid_body");
  }
}

/**
 * Read a JSON body (any content type — sendBeacon posts text/plain) with a size cap. Throws BodyError.
 * Form posts (application/x-www-form-urlencoded / multipart) are returned as a plain object of strings.
 */
export async function readBody(req: Request, maxBytes = 32 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new BodyError(413);
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) throw new BodyError(400);
    const out: Record<string, string> = {};
    form.forEach((v, k) => {
      if (typeof v === "string") out[k] = v;
    });
    return out;
  }
  const text = await req.text().catch(() => null);
  if (text == null) throw new BodyError(400);
  if (Buffer.byteLength(text) > maxBytes) throw new BodyError(413);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BodyError(400);
  }
}

export function isFormPost(req: Request): boolean {
  const type = req.headers.get("content-type") ?? "";
  return type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
}

/** Map an unexpected error to a JSON response without leaking internals (logged server-side). */
export function errorResponse(err: unknown, context: string): Response {
  if (err instanceof BodyError) {
    return err.status === 413 ? json({ error: "payload_too_large" }, 413) : json({ error: "validation", fields: { form: "invalid" } }, 400);
  }
  if (isDataError(err)) {
    const status = err.code === "not_found" ? 404 : 400;
    return json(err.fields ? { error: err.code, fields: err.fields } : { error: err.code }, status);
  }
  console.error(`[onde] ${context} failed`, err);
  return json({ error: "server" }, 500);
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
