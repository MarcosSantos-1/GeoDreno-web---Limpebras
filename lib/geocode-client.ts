export type GeocodeHit = { lat: number; lng: number; address: string | null };

/**
 * Chama a rota interna de geocodificação direta (endereço -> lat/lng).
 * Usa Google Geocoding quando há chave no servidor; senão Nominatim.
 */
export async function fetchGeocode(query: string): Promise<GeocodeHit | null> {
  const q = query.trim();
  if (!q) return null;
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
  if (!res.ok) return null;
  const j = (await res.json()) as { result?: GeocodeHit | null };
  return j.result ?? null;
}
