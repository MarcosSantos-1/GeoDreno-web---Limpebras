"use client";

import { useAuthWeb } from "@/lib/contexts/AuthWebContext";
import { AppShell } from "../components/AppShell";
import { db } from "@/lib/firebase";
import type { BueiroRegistroDoc } from "@shared/firestore";
import { splitDateTimeExport } from "@/lib/format";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";

type Row = BueiroRegistroDoc & { id: string };

export default function ExportarPage() {
  const { ready, profile } = useAuthWeb();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !profile?.nome) router.replace("/");
  }, [ready, profile?.nome, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = query(
        collection(db, "bueiros_registros"),
        orderBy("createdAt", "desc"),
        limit(8000),
      );
      const snap = await getDocs(q);
      const list: Row[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as BueiroRegistroDoc) }));
      setRows(list);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !profile?.nome) return;
    queueMicrotask(() => void load());
  }, [ready, profile?.nome, load]);

  const downloadXlsx = () => {
    const data = rows.map((r) => {
      const { data: dataStr, hora: horaStr } = splitDateTimeExport(r.createdAt);
      const enderecoLinha =
        r.enderecoGeocodificado?.trim() || r.logradouro?.trim() || "";
      return {
        tipo: r.tipo === "boca_lobo" ? "Boca de Lobo" : "Boca de Leão",
        quantidade: r.quantidade,
        latitude: r.lat,
        longitude: r.lng,
        logradouro: enderecoLinha,
        endereco_manual: r.enderecoManual ?? "",
        subprefeitura: r.subprefeitura ?? "",
        setor: r.setor,
        usuario: r.displayName ?? "",
        data: dataStr,
        hora: horaStr,
        gps_alerta: r.gpsAlerta ?? false,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "bueiros");
    XLSX.writeFile(wb, `geodreno-bueiros-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!ready || !profile?.nome) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-2xl font-bold lg:text-3xl">Exportar dados</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Coluna <span className="font-medium">logradouro</span>: endereço do ponto (geocodificado por
          lat/lng quando disponível; registros antigos usam o nome do catálogo do setor).
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          Carregando…
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}

      {!loading && !err && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={downloadXlsx}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-500"
          >
            <svg
              className="h-5 w-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="2" fill="none" strokeWidth={2} />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            Baixar planilha dos dados
          </button>
          <button
            type="button"
            onClick={load}
            className="rounded-xl px-5 py-2.5 font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Atualizar lista
          </button>
          <span className="self-center text-sm text-zinc-500">{rows.length} linhas</span>
        </div>
      )}
    </AppShell>
  );
}
