import type { BueiroTipo } from "@shared/firestore";
import type { ProgressStatus } from "@shared/setor-status";

/** Subconjunto compatível com `pathOptions` do Leaflet. */
export type MapPathStyle = {
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  opacity?: number;
  dashArray?: string;
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

/** Quatro tons estáveis por sub, para mapas vizinhos não colarem um no outro. */
const EIXO_SUB_TONES: Record<string, readonly [string, string, string, string]> = {
  CV: ["#3f6212", "#65a30d", "#84cc16", "#4d7c0f"],
  JT: ["#1e3a8a", "#312e81", "#5b21b6", "#6d28d9"],
  MG: ["#0e7490", "#0891b2", "#06b6d4", "#155e75"],
  ST: ["#a16207", "#ca8a04", "#eab308", "#facc15"],
};

/** Cor base da sub; cinza para subs desconhecidas. */
export function eixoSubColor(eixo: string | undefined): string {
  const sub = (eixo ?? "").slice(0, 2).toUpperCase();
  return EIXO_SUB_COLORS[sub] ?? "#6b7280";
}

function eixoToneIndex(eixo: string): number {
  let h = 0;
  for (let i = 0; i < eixo.length; i++) h = (h * 31 + eixo.charCodeAt(i)) >>> 0;
  return h % 4;
}

/** Tom do mapa dentro da família da sub. O mesmo código sempre cai no mesmo tom. */
export function eixoToneColor(eixo: string | undefined): string {
  const name = (eixo ?? "").trim();
  const sub = name.slice(0, 2).toUpperCase();
  const tones = EIXO_SUB_TONES[sub];
  if (!tones || !name) return eixoSubColor(eixo);
  return tones[eixoToneIndex(name)];
}

/**
 * Linha do eixo: tom da sub + status efetivo.
 * Pendente fica fino, em execução grosso e pontilhado, finalizado grosso e contínuo.
 */
export function eixoLineStyle(
  eixo: string | undefined,
  isDark: boolean,
  status: ProgressStatus = "pendente",
): MapPathStyle {
  const color = eixoToneColor(eixo);
  if (status === "finalizado") {
    return { color, weight: 5.4, opacity: 1 };
  }
  if (status === "em_execucao") {
    return { color, weight: 5.4, opacity: 1, dashArray: "10 8" };
  }
  return {
    color,
    weight: 2.2,
    opacity: isDark ? 0.7 : 0.75,
  };
}

export function eixoStatusLabel(status: ProgressStatus): string {
  if (status === "em_execucao") return "Em execução";
  if (status === "finalizado") return "Finalizado";
  return "Pendente";
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
