"use client";
// What the page's buttons call. The page passes server actions already bound to whoever is looking:
//   • the client (/c/<token>): the token-checked client actions (src/app/(portal)/c/[token]/actions.ts) — the changes
//     follow the customer's mode (direct / approval), count in their daily limit and notify the owner;
//   • the owner (/admin/customers/<id>/dashboard): admin actions bound to the customer id
//     (src/app/(admin)/admin/portal-actions.ts) — applied at once, actor "owner", no push, no limit. A pending
//     request shows Approve / Reject instead of the client's "Annuler la demande".
// The client page's bundle never references the admin actions: they only exist in the owner's page payload.
import { createContext, useContext, type ReactNode } from "react";
import type { LinkChoice, PreviewResult, SimpleResult, SubmitResult } from "./model";

export type ChangeInput = { code: string; choice: LinkChoice; link: string };

type Common = {
  preview: (input: ChangeInput) => Promise<PreviewResult>;
  submit: (input: ChangeInput) => Promise<SubmitResult>;
  saveLocation: (input: { code: string; label: string }) => Promise<SimpleResult>;
};
export type PortalActions =
  | (Common & { viewer: "client"; cancel: (input: { code: string }) => Promise<SimpleResult> })
  | (Common & { viewer: "owner"; decide: (input: { code: string; decision: "approve" | "reject" }) => Promise<SimpleResult> });

const Ctx = createContext<PortalActions | null>(null);

export function PortalActionsProvider({ actions, children }: { actions: PortalActions; children: ReactNode }) {
  return <Ctx.Provider value={actions}>{children}</Ctx.Provider>;
}

export function usePortalActions(): PortalActions {
  const a = useContext(Ctx);
  if (!a) throw new Error("usePortalActions outside PortalActionsProvider");
  return a;
}
