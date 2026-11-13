"use server";
// Client-page actions. No session: the capability token travels with every call (bound by the page:
// `previewLinkAction.bind(null, token)`) and src/server/portal.ts re-checks it (and the product's owner, status, the
// link and the daily limit) each time. Inputs are shape-checked here, calls are throttled per IP, and results are
// plain codes — never rows, ids or other customers' data.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { LINK_CHOICES, type PreviewResult, type SimpleResult, type SubmitResult } from "@/components/portal/model";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { cancelClientRequest, previewClientChange, setClientLocation, submitClientChange } from "@/server/portal";

const token = z.string().min(1).max(80);
const code = z.string().min(1).max(16);
const changeSchema = z.object({ code, choice: z.enum(LINK_CHOICES), link: z.string().max(2100) });
const locationSchema = z.object({ code, label: z.string().max(200) });
const cancelSchema = z.object({ code });

/** At most 120 client-page calls per IP per 10 minutes (token guessing, scripted abuse). */
async function throttled(): Promise<boolean> {
  const ip = getClientIp(await headers()) ?? "unknown";
  return !rateLimit(`portal-action:${ip}`, 120, 10 * 60 * 1000).ok;
}

export async function previewLinkAction(tk: string, input: z.input<typeof changeSchema>): Promise<PreviewResult> {
  const t = token.safeParse(tk);
  const parsed = changeSchema.safeParse(input);
  if (!t.success || !parsed.success) return { ok: false, error: "invalid" };
  if (await throttled()) return { ok: false, error: "rate_limited" };
  const d = parsed.data;
  return previewClientChange(t.data, d.code, d.choice, d.link);
}

export async function submitLinkAction(tk: string, input: z.input<typeof changeSchema>): Promise<SubmitResult> {
  const t = token.safeParse(tk);
  const parsed = changeSchema.safeParse(input);
  if (!t.success || !parsed.success) return { ok: false, error: "invalid" };
  if (await throttled()) return { ok: false, error: "rate_limited" };
  const d = parsed.data;
  const res = await submitClientChange(t.data, d.code, d.choice, d.link);
  if (res.ok) refresh();
  return res;
}

export async function cancelRequestAction(tk: string, input: z.input<typeof cancelSchema>): Promise<SimpleResult> {
  const t = token.safeParse(tk);
  const parsed = cancelSchema.safeParse(input);
  if (!t.success || !parsed.success) return { ok: false, error: "invalid" };
  if (await throttled()) return { ok: false, error: "rate_limited" };
  const res = await cancelClientRequest(t.data, parsed.data.code);
  if (res.ok) refresh();
  return res;
}

export async function saveLocationAction(tk: string, input: z.input<typeof locationSchema>): Promise<SimpleResult> {
  const t = token.safeParse(tk);
  const parsed = locationSchema.safeParse(input);
  if (!t.success || !parsed.success) return { ok: false, error: "invalid" };
  if (await throttled()) return { ok: false, error: "rate_limited" };
  const res = await setClientLocation(t.data, parsed.data.code, parsed.data.label);
  if (res.ok) refresh();
  return res;
}
