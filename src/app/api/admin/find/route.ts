// GET /api/admin/find?q=… → "Find a stand" (admin search box on every page): the code printed under a QR (case, spaces,
// dashes, "ONDE-" or the full link ignored; look-alikes such as O/0 read as Q/D/C/G only when one code fits), or a
// customer name / business / phone. Empty q → the most recently changed stands. See findStands in src/server/stands.ts.
import type { NextRequest } from "next/server";
import { errorResponse, json } from "@/server/http";
import { adminApiGuard } from "@/server/session";
import { findStands } from "@/server/stands";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;
  try {
    return json(findStands(req.nextUrl.searchParams.get("q") ?? ""));
  } catch (err) {
    return errorResponse(err, "GET /api/admin/find");
  }
}
