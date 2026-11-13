"use client";
// Status stepper new → confirmed → preparing → shipped → delivered (+ cancel / reopen), optimistic.
import { motion } from "motion/react";
import { useOptimistic, useState, useTransition } from "react";
import { updateOrderStatusAction } from "@/app/(admin)/admin/actions";
import { Modal } from "../controls";
import { ORDER_FLOW, ORDER_STATUS_META } from "../meta";
import { useToast } from "../toast";
import type { OrderStatus } from "../types";
import { OrderStatusPill } from "../ui";

const HINT: Record<OrderStatus, string> = {
  new: "Call or WhatsApp the customer to confirm the order and the address.",
  confirmed: "Confirmed — prepare the products and write the smart links to the chips.",
  preparing: "Preparing — once packed, hand it to the delivery company.",
  shipped: "On its way — mark delivered when the cash is collected.",
  delivered: "Delivered — the customer has now earned the returning-customer discount on their next order.",
  cancelled: "Cancelled — if this order used the returning discount, it was given back to the customer.",
};

export default function OrderStatusControl({ id, status, number }: { id: number; status: OrderStatus; number: string }) {
  const toast = useToast();
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const change = (next: OrderStatus) => {
    if (next === optimistic) return;
    startTransition(async () => {
      setOptimistic(next);
      const res = await updateOrderStatusAction({ id, status: next });
      if (res.ok) toast.ok(`${number} → ${ORDER_STATUS_META[next].label}`, next === "delivered" ? "Returning-customer discount unlocked for their next order." : undefined);
      else toast.err("Couldn’t update the status", res.error);
    });
  };

  const cancelled = optimistic === "cancelled";
  const idx = ORDER_FLOW.indexOf(optimistic as (typeof ORDER_FLOW)[number]);
  const nextStep = !cancelled && idx >= 0 && idx < ORDER_FLOW.length - 1 ? ORDER_FLOW[idx + 1] : null;

  return (
    <div>
      <div className="card-h">
        <div>
          <h3>Status</h3>
          <div className="sub">{HINT[optimistic]}</div>
        </div>
        <div className="row wrap">
          <OrderStatusPill status={optimistic} />
          {cancelled ? (
            <button type="button" className="btn sm" onClick={() => change("new")} disabled={pending}>
              Reopen as new
            </button>
          ) : (
            <>
              {nextStep ? (
                <button type="button" className="btn sm p" onClick={() => change(nextStep)} disabled={pending}>
                  Mark {ORDER_STATUS_META[nextStep].label.toLowerCase()} →
                </button>
              ) : null}
              <button type="button" className="btn sm danger" onClick={() => setConfirmCancel(true)} disabled={pending}>
                Cancel order
              </button>
            </>
          )}
        </div>
      </div>

      <ol className={`stepper${cancelled ? " cancelled" : ""}`} aria-label="Order progress" style={{ listStyle: "none", padding: 0 }}>
        {ORDER_FLOW.map((s, i) => {
          const done = !cancelled && idx > i;
          const cur = !cancelled && idx === i;
          return (
            <li key={s} className={`step${done ? " done" : ""}${cur ? " cur" : ""}`} style={i === ORDER_FLOW.length - 1 ? { flex: "none" } : undefined}>
              <button type="button" onClick={() => change(s)} disabled={pending || cur} aria-current={cur ? "step" : undefined} aria-label={`Set status to ${ORDER_STATUS_META[s].label}`}>
                <motion.span className="dot" layout animate={cur ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={{ duration: 0.5 }}>
                  {done ? "✓" : i + 1}
                </motion.span>
                {ORDER_STATUS_META[s].label}
              </button>
              {i < ORDER_FLOW.length - 1 ? (
                <span className="bar" aria-hidden>
                  <i />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={`Cancel ${number}?`}
        subtitle="You can reopen it later. A returning-customer discount used on this order is given back."
        size="sm"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirmCancel(false)} data-autofocus>
              Keep order
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setConfirmCancel(false);
                change("cancelled");
              }}
            >
              Cancel order
            </button>
          </>
        }
      >
        <p className="hint">Smart links already created for this order stay as they are — disable them from Products if needed.</p>
      </Modal>
    </div>
  );
}
