"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { TileLayer, useMap } from "react-leaflet";

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

export function ThemeTiles({ dark }: { dark: boolean }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const pane = map.getPane("tilePane");
    if (pane) {
      pane.style.filter = dark
        ? "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.95)"
        : "";
    }
    return () => {
      if (pane) pane.style.filter = "";
    };
  }, [dark, map]);
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={19}
    />
  );
}
