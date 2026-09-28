import { fetchSatelliteTile } from "@/lib/google-map-tiles";
import { NextRequest, NextResponse } from "next/server";

function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin") return true;
  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

function coord(value: string, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) return null;
  return n;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ z: string; x: string; y: string }> },
) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const { z: zs, x: xs, y: ys } = await ctx.params;
  const z = coord(zs, 22);
  const limit = z == null ? 0 : 2 ** z - 1;
  const x = z == null ? null : coord(xs, limit);
  const y = z == null ? null : coord(ys, limit);
  if (z == null || x == null || y == null) {
    return new NextResponse(null, { status: 400 });
  }
  try {
    const tile = await fetchSatelliteTile(z, x, y);
    if (!tile) return new NextResponse(null, { status: 404 });
    return new NextResponse(tile.body, {
      headers: {
        "Content-Type": tile.contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    console.error("[map-tiles] tile", e);
    return new NextResponse(null, { status: 404 });
  }
}
