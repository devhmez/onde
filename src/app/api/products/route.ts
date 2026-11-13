// GET /api/products?locale=fr|en → PublicProduct[] (active catalog, localized, sorted; prices in millimes).
import type { NextRequest } from "next/server";
import { listPublicProducts } from "@/server/catalog";
import { errorResponse, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const locale = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "fr";
    return json(await listPublicProducts(locale));
  } catch (err) {
    return errorResponse(err, "GET /api/products");
  }
}
