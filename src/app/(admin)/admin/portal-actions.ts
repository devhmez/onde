"use server";
// Client page (onde.tn/c/<token>) — owner-side server actions: the "Client page" card on the customer page, and the
// owner's view of a client's dashboard (/admin/customers/<id>/dashboard, bound to the customer id by that page).
// Every action: requireAdmin() → zod → src/server/portal.ts → revalidate / refresh. The returned view never carries
// the token other than inside the link the owner is allowed to see.
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/admin/types";
import { LINK_CHOICES, type PreviewResult, type SimpleResult, type SubmitResult } from "@/components/portal/model";
import { requireAdmin } from "@/lib/auth";
import {
  decideOwnerRequest,
  decidePortalRequest,
  getPortalAdmin,
  PortalError,
  previewOwnerChange,
  regeneratePortalLink,
  revertDestinationChange,
  setOwnerLocation,
  setPortalEnabled,
  setPortalMode,
  setTagLocation,
  submitOwnerChange,
  type PortalAdminView,
} from "@/server/portal";

const id = z.number().int().positive();

const MESSAGES: Record<PortalError["code"], string> = {
  not_found: "This item no longer exists — refresh the page.",
  anonymized: "This customer was anonymized: a client page can’t be created for them.",
  stale: "This changed in the meantime — refresh the page and try again.",
  no_previous: "There is no previous destination to go back to.",
  already: "This request was already handled.",
};

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof PortalError) return { ok: false, error: MESSAGES[e.code] };
  if (e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "validation") {
    return { ok: false, error: "That destination is not valid any more." };
  }
  console.error("[admin portal action]", e);
  return { ok: false, error: "Something went wrong — please try again." };
}

async function fresh(customerId: number): Promise<ActionResult<{ view: PortalAdminView }>> {
  revalidatePath("/admin", "layout");
  const view = await getPortalAdmin(customerId);
  if (!view) return { ok: false, error: MESSAGES.not_found };
  return { ok: true, data: { view } };
}

export async function setPortalEnabledAction(customerId: number, enabled: boolean): Promise<ActionResult<{ view: PortalAdminView }>> {
  await requireAdmin();
  const p = z.object({ customerId: id, enabled: z.boolean() }).safeParse({ customerId, enabled });
  if (!p.success) return { ok: false, error: "Invalid request." };
  try {
    setPortalEnabled(p.data.customerId, p.data.enabled);
    return fresh(p.data.customerId);
  } catch (e) {
    return fail(e);
  }
}

export async function regeneratePortalAction(customerId: number): Promise<ActionResult<{ view: PortalAdminView }>> {
  await requireAdmin();
  if (!id.safeParse(customerId).success) return { ok: false, error: "Invalid request." };
  try {
    regeneratePortalLink(customerId);
    return fresh(customerId);
  } catch (e) {
    return fail(e);
  }
}

export async function setPortalModeAction(customerId: number, mode: "direct" | "approval"): Promise<ActionResult<{ view: PortalAdminView }>> {
  await requireAdmin();
  const p = z.object({ customerId: id, mode: z.enum(["direct", "approval"]) }).safeParse({ customerId, mode });
  if (!p.success) return { ok: false, error: "Invalid request." };
  try {
    setPortalMode(p.data.customerId, p.data.mode);
    return fresh(p.data.customerId);
  } catch (e) {
    return fail(e);
  }
}

export async function setTagLocationAction(customerId: number, tagId: number, label: string): Promise<ActionResult<{ view: PortalAdminView }>> {
  await requireAdmin();
  const p = z.object({ customerId: id, tagId: id, label: z.string().max(200) }).safeParse({ customerId, tagId, label });
  if (!p.success) return { ok: false, error: "Location is too long (40 characters max)." };
  try {
    setTagLocation(p.data.tagId, p.data.label);
    return fresh(p.data.customerId);
  } catch (e) {
    return fail(e);
  }
}

export async function decidePortalRequestAction(requestId: number, decision: "approve" | "reject"): Promise<ActionResult<{ view: PortalAdminView }>> {
  await requireAdmin();
  const p = z.object({ requestId: id, decision: z.enum(["approve", "reject"]) }).safeParse({ requestId, decision });
  if (!p.success) return { ok: false, error: "Invalid request." };
  try {
    const { customerId } = await decidePortalRequest(p.data.requestId, p.data.decision);
    return fresh(customerId);
  } catch (e) {
    return fail(e);
  }
}

export async function revertDestinationAction(customerId: number, historyId: number): Promise<ActionResult<{ view: PortalAdminView }>> {
  await requireAdmin();
  const p = z.object({ customerId: id, historyId: id }).safeParse({ customerId, historyId });
  if (!p.success) return { ok: false, error: "Invalid request." };
  try {
    await revertDestinationChange(p.data.historyId);
    return fresh(p.data.customerId);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The owner's view of a client's dashboard (same page and components as /c/<token>). Changes are recorded with actor
// "owner", send no "client changed" push and never count in the client's daily limit (src/server/portal.ts).

const code = z.string().min(1).max(16);
const ownerChange = z.object({ code, choice: z.enum(LINK_CHOICES), link: z.string().max(2100) });
const ownerLocation = z.object({ code, label: z.string().max(200) });
const ownerDecision = z.object({ code, decision: z.enum(["approve", "reject"]) });

export async function ownerPreviewLinkAction(customerId: number, input: z.input<typeof ownerChange>): Promise<PreviewResult> {
  await requireAdmin();
  const c = id.safeParse(customerId);
  const p = ownerChange.safeParse(input);
  if (!c.success || !p.success) return { ok: false, error: "invalid" };
  return previewOwnerChange(c.data, p.data.code, p.data.choice, p.data.link);
}

export async function ownerSubmitLinkAction(customerId: number, input: z.input<typeof ownerChange>): Promise<SubmitResult> {
  await requireAdmin();
  const c = id.safeParse(customerId);
  const p = ownerChange.safeParse(input);
  if (!c.success || !p.success) return { ok: false, error: "invalid" };
  const res = await submitOwnerChange(c.data, p.data.code, p.data.choice, p.data.link);
  if (res.ok) refresh();
  return res;
}

export async function ownerSaveLocationAction(customerId: number, input: z.input<typeof ownerLocation>): Promise<SimpleResult> {
  await requireAdmin();
  const c = id.safeParse(customerId);
  const p = ownerLocation.safeParse(input);
  if (!c.success || !p.success) return { ok: false, error: "invalid" };
  const res = await setOwnerLocation(c.data, p.data.code, p.data.label);
  if (res.ok) refresh();
  return res;
}

export async function ownerDecideRequestAction(customerId: number, input: z.input<typeof ownerDecision>): Promise<SimpleResult> {
  await requireAdmin();
  const c = id.safeParse(customerId);
  const p = ownerDecision.safeParse(input);
  if (!c.success || !p.success) return { ok: false, error: "invalid" };
  const res = await decideOwnerRequest(c.data, p.data.code, p.data.decision);
  if (res.ok) refresh();
  return res;
}
