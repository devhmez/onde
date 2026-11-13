// GET /api/settings/public → { deliveryFee, freeDeliveryThreshold, returningDiscountPct, phone, whatsapp, email,
// instagram, facebook, tiktok, storeOpen } (money in millimes; empty strings = not configured, hide in the UI).
import { errorResponse, json } from "@/server/http";
import { getPublicSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(await getPublicSettings());
  } catch (err) {
    return errorResponse(err, "GET /api/settings/public");
  }
}
