"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";

/** Zoom máximo do mapa. O satélite do Google chega perto disso; o OSM amplia a imagem a partir do 19. */
export const MAP_MAX_ZOOM = 22;

export function IconFix() {
  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }, []);
  return null;
}

function useTilePane(dark: boolean, invert: boolean) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const pane = map.getPane("tilePane");
    if (!pane) return;
    pane.style.filter = invert
      ? "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.95)"
      : "";
    return () => {
      pane.style.filter = "";
    };
  }, [dark, invert, map]);
}

function OsmTiles({ dark }: { dark: boolean }) {
  useTilePane(dark, dark);
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={MAP_MAX_ZOOM}
      maxNativeZoom={19}
    />
  );
}

function GoogleTiles() {
  useTilePane(false, false);
  return (
    <TileLayer
      attribution='Imagens &copy; <a href="https://www.google.com/maps">Google</a>'
      url="/api/map-tiles/{z}/{x}/{y}"
      maxZoom={MAP_MAX_ZOOM}
      maxNativeZoom={MAP_MAX_ZOOM}
    />
  );
}

export function ThemeTiles({
  dark,
  basemap,
}: {
  dark: boolean;
  /** Quando omitido, usa satélite se a sessão do Google abrir e cai no OpenStreetMap se não. */
  basemap?: "google" | "osm";
}) {
  const [auto, setAuto] = useState<"loading" | "google" | "osm">("loading");
  const controlled = basemap != null;

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    fetch("/api/map-tiles/session")
      .then((res) => res.json())
      .then((data: { ok?: boolean }) => {
        if (!cancelled) setAuto(data.ok ? "google" : "osm");
      })
      .catch(() => {
        if (!cancelled) setAuto("osm");
      });
    return () => {
      cancelled = true;
    };
  }, [controlled]);

  const source = controlled ? basemap : auto;
  if (source === "osm") return <OsmTiles dark={dark} />;
  if (source === "google") return <GoogleTiles />;
  return null;
}
