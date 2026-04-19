/**
 * Chama a rota interna que faz geocodificação reversa (Nominatim ou Google, conforme env).
 */
export async function fetchReverseGeocode(lat: number, lng: number): Promise<string | null> {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const res = await fetch(`/api/reverse-geocode?${q.toString()}`);
  if (!res.ok) return null;
  const j = (await res.json()) as { address?: string | null };
  const a = j.address?.trim();
  return a && a.length > 0 ? a : null;
}
