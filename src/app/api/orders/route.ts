// POST /api/orders  body = CreateOrderInput (+ honeypot `website`, must stay empty)
//   201 { number, subtotal, discount, deliveryFee, total }                       (millimes)
//   400 { error: "validation" | "empty" | "closed", fields?: Record<path, code> }  e.g. fields["customer.phone"] = "invalid_phone"
//   429 { error: "rate_limited" }  (5/min/IP)
// The server re-prices everything from the DB; client prices are ignored. Public orders are channel "web" or "whatsapp".
import { limitRequest, tooManyRequests } from "@/lib/ratelimit";
import { errorResponse, isRecord, json, readBody } from "@/server/http";
import { createOrder } from "@/server/orders";
import type { CreateOrderInput } from "@/server/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = limitRequest(req, "orders", 5);
  if (!rl.ok) return tooManyRequests(rl);
  try {
    const body = await readBody(req, 64 * 1024);
    if (!isRecord(body)) return json({ error: "validation", fields: { form: "invalid" } }, 400);

    // Honeypot: real visitors never see this field.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return json({ error: "validation", fields: { website: "invalid" } }, 400);
    }

    const channel = body.channel === "whatsapp" ? "whatsapp" : "web";
    const input = { ...body, channel } as unknown as CreateOrderInput;
    delete (input as { website?: unknown }).website;

    const { order } = await createOrder(input);
    return json(
      { number: order.number, subtotal: order.subtotal, discount: order.discount, deliveryFee: order.deliveryFee, total: order.total },
      201,
    );
  } catch (err) {
    return errorResponse(err, "POST /api/orders");
  }
}
