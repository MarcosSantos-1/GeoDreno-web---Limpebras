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

export const BUEIRO_CIRCLE_RADIUS_MAIN = 4;

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
