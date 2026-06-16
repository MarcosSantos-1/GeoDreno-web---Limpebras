import { NextRequest, NextResponse } from "next/server";

/** Nominatim (OpenStreetMap): fallback quando não há chave do Google. User-Agent obrigatório. */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export type GeocodeResult = {
  lat: number;
  lng: number;
  address: string | null;
};

async function geocodeGoogle(q: string, key: string): Promise<GeocodeResult | null> {
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address", q);
  u.searchParams.set("key", key);
  u.searchParams.set("language", "pt-BR");
  u.searchParams.set("region", "br");
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  const j = (await res.json()) as {
    status: string;
    results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
  };
  if (j.status !== "OK" || !j.results?.length) return null;
  const top = j.results[0];
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    address: top.formatted_address ?? null,
  };
}

async function geocodeNominatim(q: string): Promise<GeocodeResult | null> {
  const u = new URL(NOMINATIM);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "1");
  u.searchParams.set("accept-language", "pt-BR");
  u.searchParams.set("countrycodes", "br");
  const res = await fetch(u.toString(), {
    headers: { "User-Agent": "GeoDreno/1.0 (inventario; +https://github.com/)" },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
  if (!Array.isArray(arr) || !arr.length) return null;
  const lat = Number(arr[0].lat);
  const lng = Number(arr[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, address: arr[0].display_name?.trim() || null };
}

/**
 * GET /api/geocode?q=<endereço>
 * Usa GOOGLE_MAPS_API_KEY (ou GOOGLE_MAPS_GEOCODING_API_KEY) se definida; senão Nominatim.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Parâmetro q obrigatório." }, { status: 400 });
  }
  const googleKey =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim();
  try {
    let result: GeocodeResult | null = null;
    if (googleKey) {
      result = await geocodeGoogle(q, googleKey);
    }
    if (!result) {
      result = await geocodeNominatim(q);
    }
    return NextResponse.json({ result });
  } catch (e) {
    console.error("[geocode]", e);
    return NextResponse.json({ result: null }, { status: 200 });
  }
}
