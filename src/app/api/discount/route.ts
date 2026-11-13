// GET /api/discount?phone=XXXXXXXX → { eligible, pct } — returning-customer check for the checkout (20/min/IP).
import type { NextRequest } from "next/server";
import { limitRequest, tooManyRequests } from "@/lib/ratelimit";
import { checkDiscount } from "@/server/customers";
import { errorResponse, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rl = limitRequest(req, "discount", 20);
  if (!rl.ok) return tooManyRequests(rl);
  try {
    const phone = (req.nextUrl.searchParams.get("phone") ?? "").slice(0, 32);
    return json(await checkDiscount(phone));
  } catch (err) {
    return errorResponse(err, "GET /api/discount");
  }
}
