"use client";

import { IconFix, ThemeTiles } from "@/app/components/map/MapLeafletCommons";
import L from "leaflet";
import { useMemo } from "react";
import { MapContainer, Marker, useMapEvents } from "react-leaflet";

function bueiroDivIcon(isDark: boolean): L.DivIcon {
  const border = isDark ? "#f5d0fe" : "#581c87";
  const bg = isDark ? "#a855f7" : "#7e22ce";
  return L.divIcon({
    className: "geodreno-divicon",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${bg};border:2px solid ${border};box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function MapClickSetPos({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

type Props = {
  lat: number;
  lng: number;
  isDark: boolean;
  onPositionChange: (lat: number, lng: number) => void;
  clickToPlaceEnabled: boolean;
  draggable: boolean;
};

export default function SetorMiniMapInner({
  lat,
  lng,
  isDark,
  onPositionChange,
  clickToPlaceEnabled,
  draggable,
}: Props) {
  const icon = useMemo(() => bueiroDivIcon(isDark), [isDark]);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={17}
      className="h-[220px] w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700"
      scrollWheelZoom
    >
      <IconFix />
      <ThemeTiles dark={isDark} />
      <MapClickSetPos enabled={clickToPlaceEnabled} onPick={onPositionChange} />
      <Marker
        position={[lat, lng]}
        icon={icon}
        draggable={draggable}
        eventHandlers={{
          dragend: (e) => {
            const p = e.target.getLatLng();
            onPositionChange(p.lat, p.lng);
          },
        }}
      />
    </MapContainer>
  );
}
