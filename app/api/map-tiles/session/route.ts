import { getSatelliteSession } from "@/lib/google-map-tiles";
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

/** Diz se o satélite do Google está disponível. Não devolve a chave nem o token. */
export async function GET(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  try {
    const session = await getSatelliteSession();
    return NextResponse.json({ ok: !!session });
  } catch (e) {
    console.error("[map-tiles] session", e);
    return NextResponse.json({ ok: false });
  }
}
