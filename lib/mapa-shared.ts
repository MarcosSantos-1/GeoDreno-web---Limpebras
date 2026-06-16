import type { BueiroTipo } from "@shared/firestore";

/** Subconjunto compatível com `pathOptions` do Leaflet. */
export type MapPathStyle = {
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  opacity?: number;
};

export const DEFAULT_MAP_CENTER: [number, number] = [-23.488481, -46.609392];
export const DEFAULT_MAP_ZOOM = 13;

export const SUBPREFS_GEOJSON_URL = "/subprefeituras-lote-wgs84.geojson";

/** Eixos de logradouros (gerado a partir dos KMLs em `assets/KMLs` via `npm run build:eixos`). */
export const EIXOS_GEOJSON_URL = "/eixos.json";

/**
 * Cor de cada subprefeitura, identificada pelos 2 primeiros caracteres do nome do mapa
 * (ex.: "CV10700BL0001" -> "CV").
 */
export const EIXO_SUB_COLORS: Record<string, string> = {
  CV: "#84cc16", // verde limão
  JT: "#1e3a8a", // azul escuro
  MG: "#06b6d4", // azul ciano
  ST: "#eab308", // amarelo
};

/** Cor do eixo a partir do nome do mapa; cinza para subs desconhecidas. */
export function eixoSubColor(eixo: string | undefined): string {
  const sub = (eixo ?? "").slice(0, 2).toUpperCase();
  return EIXO_SUB_COLORS[sub] ?? "#6b7280";
}

/** Estilo de uma linha de eixo, colorida pela subprefeitura. */
export function eixoLineStyle(eixo: string | undefined, isDark: boolean): MapPathStyle {
  return {
    color: eixoSubColor(eixo),
    weight: 3.1,
    opacity: isDark ? 0.9 : 0.85,
  };
}

export type EixoFeature = {
  type: "Feature";
  properties: { eixo?: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

export type EixosCollection = {
  type: "FeatureCollection";
  features: EixoFeature[];
};

/** Distância (m) de P a um segmento AB usando projeção equirretangular local em P. */
function pointSegmentMeters(
  lat: number,
  lng: number,
  a: [number, number],
  b: [number, number],
): number {
  const R = 111320; // metros por grau de latitude (aprox.)
  const cos = Math.cos((lat * Math.PI) / 180);
  const px = 0;
  const py = 0;
  const ax = (a[0] - lng) * R * cos;
  const ay = (a[1] - lat) * R;
  const bx = (b[0] - lng) * R * cos;
  const by = (b[1] - lat) * R;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Encontra o eixo (mapa) mais próximo de um ponto. Ignora eixos além de `maxMeters`.
 * Usa uma janela de bounding-box barata por coordenada para acelerar.
 */
export function nearestEixo(
  fc: EixosCollection | null,
  lat: number,
  lng: number,
  maxMeters = 200,
): { eixo: string; distM: number } | null {
  if (!fc?.features?.length) return null;
  // ~maxMeters convertidos para graus (folga 1.5x) para o pré-filtro.
  const degWin = (maxMeters * 1.5) / 111320 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  let best: { eixo: string; distM: number } | null = null;
  for (const f of fc.features) {
    const coords = f.geometry?.coordinates;
    const eixo = f.properties?.eixo;
    if (!eixo || !Array.isArray(coords) || coords.length < 2) continue;
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      // Pré-filtro: pula segmentos cujos dois extremos estão fora da janela.
      const aIn = Math.abs(a[1] - lat) <= degWin && Math.abs(a[0] - lng) <= degWin;
      const bIn = Math.abs(b[1] - lat) <= degWin && Math.abs(b[0] - lng) <= degWin;
      if (!aIn && !bIn) continue;
      const d = pointSegmentMeters(lat, lng, a, b);
      if (d <= maxMeters && (!best || d < best.distM)) {
        best = { eixo, distM: d };
      }
    }
  }
  return best;
}

export function tipoLabelBr(tipo: BueiroTipo): string {
  return tipo === "boca_leao" ? "Boca de leão" : "Boca de lobo";
}

/** Marcadores compactos no mapa principal (muitos pontos). */
export function bueiroMarkerPathOptions(isDark: boolean): MapPathStyle {
  return isDark
    ? {
        color: "#f5d0fe",
        fillColor: "#c084fc",
        fillOpacity: 0.95,
        weight: 1,
      }
    : {
        color: "#581c87",
        fillColor: "#7c3aed",
        fillOpacity: 0.92,
        weight: 1,
      };
}

/** Raio em px (SVG); valores maiores melhoram toque/clique sem poluir demais o mapa. */
export const BUEIRO_CIRCLE_RADIUS_MAIN = 7;

/** Abre o Street View do Google Maps no ponto (link público; não exige API key). */
export function googleMapsStreetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export function subprefPolygonStyle(sg: string | undefined): MapPathStyle {
  const base: MapPathStyle = { weight: 2, fillOpacity: 0.14, opacity: 0.95 };
  switch (sg) {
    case "CV":
      return { ...base, color: "#166534", fillColor: "#22c55e" };
    case "JT":
      return { ...base, color: "#172554", fillColor: "#1e3a8a" };
    case "MG":
      return { ...base, color: "#0e7490", fillColor: "#06b6d4" };
    case "ST":
      return { ...base, color: "#a16207", fillColor: "#eab308" };
    default:
      return { ...base, color: "#52525b", fillColor: "#a1a1aa" };
  }
}
