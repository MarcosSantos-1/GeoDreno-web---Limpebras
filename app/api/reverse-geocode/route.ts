import { NextRequest, NextResponse } from "next/server";

/** Nominatim: uso moderado; 1 req/s recomendado em lote. User-Agent obrigatório. */
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

function parseLatLng(req: NextRequest): { lat: number; lng: number } | null {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

async function reverseGoogle(lat: number, lng: number, key: string): Promise<string | null> {
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("latlng", `${lat},${lng}`);
  u.searchParams.set("key", key);
  u.searchParams.set("language", "pt-BR");
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  const j = (await res.json()) as { status: string; results?: { formatted_address: string }[] };
  if (j.status !== "OK" || !j.results?.length) return null;
  return j.results[0].formatted_address ?? null;
}

async function reverseNominatim(lat: number, lng: number): Promise<string | null> {
  const u = new URL(NOMINATIM);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("lat", String(lat));
  u.searchParams.set("lon", String(lng));
  u.searchParams.set("accept-language", "pt-BR");
  const res = await fetch(u.toString(), {
    headers: {
      "User-Agent": "GeoDreno/1.0 (inventario; +https://github.com/)",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { display_name?: string };
  const name = j.display_name?.trim();
  return name && name.length > 0 ? name : null;
}

/**
 * GET /api/reverse-geocode?lat=&lng=
 * Usa GOOGLE_MAPS_GEOCODING_API_KEY se definida; senão Nominatim (OpenStreetMap).
 */
export async function GET(req: NextRequest) {
  const ll = parseLatLng(req);
  if (!ll) {
    return NextResponse.json({ error: "lat/lng inválidos" }, { status: 400 });
  }
  const googleKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim();
  try {
    let address: string | null = null;
    if (googleKey) {
      address = await reverseGoogle(ll.lat, ll.lng, googleKey);
    }
    if (!address) {
      address = await reverseNominatim(ll.lat, ll.lng);
    }
    return NextResponse.json({ address });
  } catch (e) {
    console.error("[reverse-geocode]", e);
    return NextResponse.json({ address: null }, { status: 200 });
  }
}
