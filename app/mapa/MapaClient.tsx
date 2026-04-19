"use client";

import { IconFix, ThemeTiles } from "@/app/components/map/MapLeafletCommons";
import { db } from "@/lib/firebase";
import { QuantidadeSelect } from "@/app/components/QuantidadeSelect";
import { SectorCombobox } from "@/app/components/SectorCombobox";
import { coordToInputText, parseCoordText, sanitizeCoordInput } from "@/lib/parse-coord";
import { fetchReverseGeocode } from "@/lib/reverse-geocode-client";
import {
  BUEIRO_CIRCLE_RADIUS_MAIN,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  SUBPREFS_GEOJSON_URL,
  bueiroMarkerPathOptions,
  googleMapsStreetViewUrl,
  subprefPolygonStyle,
  tipoLabelBr,
} from "@/lib/mapa-shared";
import type { BueiroRegistroDoc, BueiroTipo, SectorCompact } from "@shared/firestore";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";

type Row = BueiroRegistroDoc & { id: string };

type SubprefFeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
};

function SubprefeiturasLayer() {
  const [data, setData] = useState<SubprefFeatureCollection | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(SUBPREFS_GEOJSON_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: SubprefFeatureCollection) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!data) return null;
  return (
    <GeoJSON
      data={data as never}
      /** Evita que os polígonos “capturem” cliques por cima dos marcadores. */
      interactive={false}
      style={(feat) => {
        const p = feat?.properties as { sg_subprefeitura?: string } | null | undefined;
        return subprefPolygonStyle(p?.sg_subprefeitura);
      }}
    />
  );
}

function MapClickRouter({
  relocateActive,
  addPickActive,
  onRelocatePick,
  onAddPick,
}: {
  relocateActive: boolean;
  addPickActive: boolean;
  onRelocatePick: (lat: number, lng: number) => void;
  onAddPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (relocateActive) onRelocatePick(e.latlng.lat, e.latlng.lng);
      else if (addPickActive) onAddPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * O `ref` do MapContainer só recebe a instância após `setContext` (assíncrono). No Safari iOS o primeiro toque
 * costuma ver `ref.current === null`. `useMap()` dentro do container preenche o ref no mesmo ciclo útil.
 */
function MapInstanceBridge({ mapRef }: { mapRef: React.MutableRefObject<LeafletMap | null> }) {
  const map = useMap();
  useLayoutEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

/** Recalcula hit-test/tiles quando o container flex muda de tamanho (evita cliques “mortos”). */
function MapResizeSync() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(el);
    const onWin = () => map.invalidateSize({ animate: false });
    window.addEventListener("orientationchange", onWin);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", onWin);
    };
  }, [map]);
  return null;
}

/** `flyTo` costuma falhar em alguns WebKit móveis; `setView` + invalidate é mais estável. */
function moveMapView(map: LeafletMap, center: [number, number], zoom: number) {
  map.invalidateSize();
  map.setView(center, zoom, { animate: true });
  requestAnimationFrame(() => {
    map.invalidateSize();
  });
}

function StreetViewGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeOpacity="0.35" />
      <circle cx="12" cy="9" r="2.25" fill="currentColor" stroke="none" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.5 18.2c.8-2.2 2.4-3.45 3.5-3.45s2.7 1.25 3.5 3.45"
      />
    </svg>
  );
}

function BueiroPopupBody({
  r,
  onRequestRelocate,
  relocateActive,
}: {
  r: Row;
  onRequestRelocate: () => void;
  relocateActive: boolean;
}) {
  const [tipo, setTipo] = useState<BueiroTipo>(r.tipo);
  const [quantidade, setQuantidade] = useState(r.quantidade);
  const [latText, setLatText] = useState(() => coordToInputText(r.lat));
  const [lngText, setLngText] = useState(() => coordToInputText(r.lng));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setTipo(r.tipo);
    setQuantidade(r.quantidade);
    setLatText(coordToInputText(r.lat));
    setLngText(coordToInputText(r.lng));
    setMsg(null);
  }, [r.id, r.tipo, r.quantidade, r.lat, r.lng]);

  const save = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (quantidade < 1 || quantidade > 6 || !Number.isInteger(quantidade)) {
        setMsg("Quantidade inválida (1–6).");
        return;
      }
      const lat = parseCoordText(latText);
      const lng = parseCoordText(lngText);
      if (lat == null || lng == null) {
        setMsg("Lat/lng inválidos (use ponto ou vírgula).");
        return;
      }
      const geo = await fetchReverseGeocode(lat, lng);
      await updateDoc(doc(db, "bueiros_registros", r.id), {
        tipo,
        quantidade,
        lat,
        lng,
        ...(geo ? { enderecoGeocodificado: geo } : {}),
      });
      setMsg("Salvo.");
    } catch (e) {
      console.error(e);
      setMsg("Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }, [r.id, tipo, quantidade, latText, lngText]);

  const remove = useCallback(async () => {
    if (!window.confirm("Excluir este registro?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await deleteDoc(doc(db, "bueiros_registros", r.id));
    } catch (e) {
      console.error(e);
      setMsg("Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }, [r.id]);

  const editBorder = "border-zinc-200";
  const editMuted = "text-zinc-500";
  const editInput = "border-zinc-300 bg-white text-zinc-900";
  const editBtnGhost = "border-zinc-300 text-zinc-800";

  const streetLat = parseCoordText(latText);
  const streetLng = parseCoordText(lngText);
  const streetViewHref =
    streetLat != null && streetLng != null ? googleMapsStreetViewUrl(streetLat, streetLng) : null;

  return (
    <div className="scheme-light min-w-[200px] max-w-[280px] text-sm">
      <div className="text-zinc-900">
        <div className="font-semibold">{tipoLabelBr(r.tipo)}</div>
        <div className="mt-1 text-xs text-zinc-600">
          Quantidade: <strong className="text-zinc-900">{r.quantidade}</strong>
        </div>
        <div className="text-xs text-zinc-600">Setor: {r.setor}</div>
        {r.enderecoManual ? (
          <div className="mt-1 text-xs text-zinc-600">{r.enderecoManual}</div>
        ) : null}
        {r.gpsAccuracyM != null ? (
          <div className="text-xs text-zinc-500">Precisão GPS: {String(r.gpsAccuracyM)} m</div>
        ) : null}
        {r.gpsAlerta ? <div className="text-xs text-amber-700">Alerta de GPS</div> : null}
        {r.displayName ? <div className="text-xs text-zinc-500">Por: {r.displayName}</div> : null}
        {streetViewHref ? (
          <a
            href={streetViewHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold ${editBtnGhost} bg-white hover:bg-zinc-50`}
            title="Abrir Street View neste ponto no Google Maps"
          >
            <StreetViewGlyph className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
            Ver local
          </a>
        ) : null}
      </div>

      <div className={`mt-3 space-y-2 border-t pt-2 ${editBorder}`}>
        <label className={`block text-[10px] font-medium uppercase ${editMuted}`}>Tipo</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as BueiroTipo)}
          className={`w-full rounded border px-1 py-1 text-xs ${editInput}`}
        >
          <option value="boca_lobo">Boca de lobo</option>
          <option value="boca_leao">Boca de leão</option>
        </select>
        <label className={`block text-[10px] font-medium uppercase ${editMuted}`}>Quantidade</label>
        <QuantidadeSelect
          value={quantidade}
          onChange={setQuantidade}
          className={`w-full rounded border px-1 py-1 text-xs ${editInput}`}
        />
        <label className={`block text-[10px] font-medium uppercase ${editMuted}`}>Lat / Lng</label>
        <div className="flex gap-1">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={latText}
            onChange={(e) => setLatText(sanitizeCoordInput(e.target.value))}
            className={`w-1/2 rounded border px-1 py-1 text-[10px] ${editInput}`}
          />
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={lngText}
            onChange={(e) => setLngText(sanitizeCoordInput(e.target.value))}
            className={`w-1/2 rounded border px-1 py-1 text-[10px] ${editInput}`}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            Excluir
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRequestRelocate}
            className={`rounded px-2 py-1 text-[11px] font-semibold ${
              relocateActive ? "bg-amber-500 text-white" : `border ${editBtnGhost} bg-white`
            }`}
          >
            {relocateActive ? "Clique no mapa…" : "Mover (mapa)"}
          </button>
        </div>
        {msg ? <p className="text-[10px] text-zinc-600">{msg}</p> : null}
      </div>
    </div>
  );
}

export default function MapaClient({
  isDark,
  userId,
  displayName,
}: {
  isDark: boolean;
  userId: string;
  displayName: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [relocateId, setRelocateId] = useState<string | null>(null);
  const [sectors, setSectors] = useState<SectorCompact[]>([]);
  const [addMode, setAddMode] = useState(false);
  const [manualDraft, setManualDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [manualSetor, setManualSetor] = useState("");
  const [manualTipo, setManualTipo] = useState<BueiroTipo>("boca_lobo");
  const [manualQtd, setManualQtd] = useState(1);
  const [manualLatText, setManualLatText] = useState("");
  const [manualLngText, setManualLngText] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMsg, setManualMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftAddress, setDraftAddress] = useState<string | null>(null);
  const [draftAddressLoading, setDraftAddressLoading] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const [mapGeoMsg, setMapGeoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!mapGeoMsg) return;
    const t = window.setTimeout(() => setMapGeoMsg(null), 6000);
    return () => window.clearTimeout(t);
  }, [mapGeoMsg]);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: number | undefined;
    const outerTimer = window.setTimeout(() => {
      if (cancelled) return;
      if (!manualDraft) {
        setDraftAddress(null);
        setDraftAddressLoading(false);
        return;
      }
      const lat = parseCoordText(manualLatText);
      const lng = parseCoordText(manualLngText);
      if (lat == null || lng == null) {
        setDraftAddress(null);
        setDraftAddressLoading(false);
        return;
      }
      setDraftAddressLoading(true);
      debounceTimer = window.setTimeout(() => {
        fetchReverseGeocode(lat, lng)
          .then((a) => {
            if (cancelled) return;
            setDraftAddress(a);
          })
          .catch(() => {
            if (!cancelled) setDraftAddress(null);
          })
          .finally(() => {
            if (!cancelled) setDraftAddressLoading(false);
          });
      }, 400);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(outerTimer);
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    };
  }, [manualDraft, manualLatText, manualLngText]);

  useEffect(() => {
    let cancelled = false;
    fetch("/sectors.compact.json")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setSectors(Array.isArray(j.sectors) ? j.sectors : []);
      })
      .catch(() => {
        if (!cancelled) setSectors([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, "bueiros_registros"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      const list: Row[] = [];
      snap.forEach((d) =>
        list.push({ id: d.id, ...(d.data() as BueiroRegistroDoc) }),
      );
      setRows(list);
    });
  }, []);

  const pathOpts = useMemo(() => bueiroMarkerPathOptions(isDark), [isDark]);

  const onMapPickRelocate = useCallback(async (lat: number, lng: number) => {
    if (!relocateId) return;
    try {
      const geo = await fetchReverseGeocode(lat, lng);
      await updateDoc(doc(db, "bueiros_registros", relocateId), {
        lat,
        lng,
        ...(geo ? { enderecoGeocodificado: geo } : {}),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setRelocateId(null);
    }
  }, [relocateId]);

  const beginRelocate = useCallback((id: string) => {
    setAddMode(false);
    setManualDraft(null);
    setManualLatText("");
    setManualLngText("");
    setManualSetor("");
    setManualMsg(null);
    setRelocateId((cur) => (cur === id ? null : id));
  }, []);

  const resetManualAdd = useCallback(() => {
    setAddMode(false);
    setManualDraft(null);
    setManualSetor("");
    setManualTipo("boca_lobo");
    setManualQtd(1);
    setManualLatText("");
    setManualLngText("");
    setManualMsg(null);
  }, []);

  const toggleAddMode = useCallback(() => {
    setManualMsg(null);
    setRelocateId(null);
    setAddMode((m) => {
      if (m) {
        setManualDraft(null);
        setManualSetor("");
        setManualLatText("");
        setManualLngText("");
      }
      return !m;
    });
  }, []);

  const onMapPickManual = useCallback((lat: number, lng: number) => {
    setManualDraft({ lat, lng });
    setManualLatText(coordToInputText(lat));
    setManualLngText(coordToInputText(lng));
    setManualMsg(null);
  }, []);

  const saveManualBueiro = useCallback(async () => {
    if (!userId) {
      setManualMsg("Sessão inválida. Entre novamente.");
      return;
    }
    if (!manualSetor.trim()) {
      setManualMsg("Selecione o setor.");
      return;
    }
    if (manualQtd < 1 || manualQtd > 6 || !Number.isInteger(manualQtd)) {
      setManualMsg("Quantidade inválida (1–6).");
      return;
    }
    const lat = parseCoordText(manualLatText);
    const lng = parseCoordText(manualLngText);
    if (lat == null || lng == null) {
      setManualMsg("Latitude e longitude inválidas.");
      return;
    }
    const sector = sectors.find((s) => s.setor === manualSetor);
    setManualBusy(true);
    setManualMsg(null);
    try {
      const geo = await fetchReverseGeocode(lat, lng);
      await addDoc(collection(db, "bueiros_registros"), {
        visitaId: `web_${crypto.randomUUID()}`,
        setor: manualSetor.trim(),
        userId,
        tipo: manualTipo,
        quantidade: manualQtd,
        lat,
        lng,
        createdAt: new Date().toISOString(),
        displayName: displayName.trim() || undefined,
        subprefeitura: sector?.subprefeitura,
        logradouro: sector?.logradouro,
        enderecoGeocodificado: geo ?? undefined,
      } as BueiroRegistroDoc);
      setNotice("Registro criado e sincronizado.");
      resetManualAdd();
    } catch (e) {
      console.error(e);
      setManualMsg("Não foi possível salvar o registro.");
    } finally {
      setManualBusy(false);
    }
  }, [
    userId,
    manualSetor,
    manualQtd,
    manualLatText,
    manualLngText,
    manualTipo,
    displayName,
    sectors,
    resetManualAdd,
  ]);

  const addPickActive = addMode && !manualDraft && !relocateId;

  const withLeafletMap = useCallback(
    (fn: (map: LeafletMap) => void, onMissing?: () => void) => {
      const tryRun = (attempt: number) => {
        const m = mapRef.current;
        if (m) {
          fn(m);
          return;
        }
        if (attempt < 12) {
          window.setTimeout(() => tryRun(attempt + 1), 40);
          return;
        }
        onMissing?.();
      };
      tryRun(0);
    },
    [],
  );

  const flyToDefaultView = useCallback(() => {
    setMapGeoMsg(null);
    withLeafletMap(
      (map) => moveMapView(map, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM),
      () => setMapGeoMsg("Mapa ainda não carregou. Toque de novo em um instante."),
    );
  }, [withLeafletMap]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:items-stretch lg:gap-4">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <div className="pointer-events-none absolute top-2 right-31 left-2 z-800 flex max-h-[45%] flex-col gap-2 overflow-hidden sm:right-32">
            {notice ? (
              <p
                role="status"
                className="pointer-events-auto rounded-lg border border-emerald-300 bg-emerald-50/95 px-2.5 py-1.5 text-xs text-emerald-900 shadow-sm backdrop-blur-sm dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100"
              >
                {notice}
              </p>
            ) : null}
            {relocateId ? (
              <p className="pointer-events-auto rounded-lg border border-amber-400 bg-amber-50/95 px-2.5 py-1.5 text-[11px] text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-700 dark:bg-amber-950/90 dark:text-amber-100">
                Modo mover: clique no mapa para definir a nova posição.
                <button
                  type="button"
                  className="ml-2 font-semibold underline"
                  onClick={() => setRelocateId(null)}
                >
                  Cancelar
                </button>
              </p>
            ) : null}
            {addMode && !manualDraft ? (
              <p className="pointer-events-auto rounded-lg border border-purple-300 bg-purple-50/95 px-2.5 py-1.5 text-[11px] text-purple-950 shadow-sm backdrop-blur-sm dark:border-purple-800 dark:bg-purple-950/90 dark:text-purple-100">
                Inclusão manual: clique no mapa na posição do bueiro.
                <button type="button" className="ml-2 font-semibold underline" onClick={resetManualAdd}>
                  Cancelar
                </button>
              </p>
            ) : null}
            {mapGeoMsg ? (
              <p
                role="status"
                className="pointer-events-auto rounded-lg border border-red-200 bg-red-50/95 px-2.5 py-1.5 text-[11px] font-medium text-red-800 shadow-sm backdrop-blur-sm dark:border-red-900 dark:bg-red-950/90 dark:text-red-200"
              >
                {mapGeoMsg}
              </p>
            ) : null}
          </div>

          <div className="pointer-events-none absolute bottom-2 left-2 z-800 rounded-md border border-zinc-200/80 bg-white/90 px-2 py-1 text-[11px] text-zinc-700 shadow-sm backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-200">
            {rows.length} pontos registrados
          </div>

          <div className="pointer-events-none absolute top-2 right-2 z-1000 flex flex-col items-end gap-2">
            <button
              type="button"
              title="Vista padrão do mapa"
              aria-label="Voltar à vista padrão do mapa"
              className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white/95 text-zinc-800 shadow-md backdrop-blur-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/95 dark:text-zinc-100 dark:hover:bg-zinc-800"
              onClick={flyToDefaultView}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            </button>
            <button
              type="button"
              title={addMode ? "Cancelar inclusão manual" : "Registrar bueiro no mapa"}
              aria-label={addMode ? "Cancelar inclusão manual" : "Registrar bueiro no mapa"}
              aria-pressed={addMode}
              onClick={toggleAddMode}
              className={`pointer-events-auto inline-flex min-h-9 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur-sm ${
                addMode
                  ? "border border-purple-800 bg-purple-800/95 text-white hover:bg-purple-900"
                  : "border border-purple-500 bg-purple-600/95 text-white hover:bg-purple-500"
              }`}
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>{addMode ? "Cancelar" : "Registrar bueiro"}</span>
            </button>
          </div>

          <MapContainer
            center={DEFAULT_MAP_CENTER}
            zoom={DEFAULT_MAP_ZOOM}
            className="h-full min-h-0 w-full flex-1 touch-manipulation"
            scrollWheelZoom
          >
            <MapInstanceBridge mapRef={mapRef} />
            <MapResizeSync />
            <IconFix />
            <ThemeTiles dark={isDark} />
            <SubprefeiturasLayer />
            <MapClickRouter
              relocateActive={!!relocateId}
              addPickActive={addPickActive}
              onRelocatePick={onMapPickRelocate}
              onAddPick={onMapPickManual}
            />
            {rows.map((r) => (
              <CircleMarker
                key={r.id}
                center={[r.lat, r.lng]}
                radius={BUEIRO_CIRCLE_RADIUS_MAIN}
                pathOptions={pathOpts}
              >
                  <Popup>
                    <BueiroPopupBody
                      r={r}
                      relocateActive={relocateId === r.id}
                      onRequestRelocate={() => beginRelocate(r.id)}
                    />
                  </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
      </div>

      {manualDraft ? (
        <aside className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-purple-200 bg-white p-3 shadow-sm dark:border-purple-900/60 dark:bg-zinc-900 lg:h-full lg:w-72 lg:max-w-[20rem] lg:flex-none lg:self-stretch xl:w-80">
          <h3 className="shrink-0 text-sm font-semibold text-purple-900 dark:text-purple-200">
            Completar registro manual
          </h3>
          <p className="mt-0.5 shrink-0 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
            Ajuste os dados e salve. Coordenadas editáveis abaixo.
          </p>
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              Setor
              <SectorCombobox
                sectors={sectors}
                value={manualSetor}
                onChange={setManualSetor}
                disabled={manualBusy}
              />
            </label>
            <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              Tipo
              <select
                value={manualTipo}
                onChange={(e) => setManualTipo(e.target.value as BueiroTipo)}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="boca_lobo">Boca de lobo</option>
                <option value="boca_leao">Boca de leão</option>
              </select>
            </label>
            <div className="min-h-0 shrink">
              <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Endereço (coordenadas)</p>
              <div
                className="mt-0.5 line-clamp-3 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] font-medium leading-snug text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100"
                title="Preenchido automaticamente pela geocodificação"
              >
                {draftAddressLoading ? (
                  <span className="text-indigo-700/80 dark:text-indigo-200/80">Buscando endereço…</span>
                ) : (
                  <span>{draftAddress ?? "Endereço indisponível para estas coordenadas."}</span>
                )}
              </div>
            </div>
            <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              Quantidade
              <QuantidadeSelect
                value={manualQtd}
                onChange={setManualQtd}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              Latitude
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={manualLatText}
                onChange={(e) => setManualLatText(sanitizeCoordInput(e.target.value))}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              Longitude
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={manualLngText}
                onChange={(e) => setManualLngText(sanitizeCoordInput(e.target.value))}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </div>
          {manualMsg ? (
            <p className="mt-2 shrink-0 text-xs text-red-600 dark:text-red-400">{manualMsg}</p>
          ) : null}
          <div className="mt-auto flex shrink-0 flex-col gap-1.5 pt-2">
            <button
              type="button"
              disabled={manualBusy}
              onClick={saveManualBueiro}
              className="w-full rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {manualBusy ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              disabled={manualBusy}
              onClick={() => {
                setManualDraft(null);
                setManualLatText("");
                setManualLngText("");
                setManualSetor("");
                setManualMsg(null);
              }}
              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-600"
            >
              Escolher outro ponto
            </button>
            <button
              type="button"
              disabled={manualBusy}
              onClick={resetManualAdd}
              className="w-full rounded-lg py-1.5 text-xs font-semibold text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Cancelar tudo
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
