"use client";

import { db } from "@/lib/firebase";
import {
  collection,
  count,
  getAggregateFromServer,
  onSnapshot,
  query,
  sum,
} from "firebase/firestore";
import type { SectorCompact, SetorProgressoDoc } from "@shared/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const SUB_CARDS: {
  code: string;
  label: string;
  barClass: string;
  textClass: string;
}[] = [
  {
    code: "CV",
    label: "Casa Verde / Cachoeirinha",
    barClass: "bg-green-600",
    textClass: "text-white",
  },
  {
    code: "JT",
    label: "Jaçanã / Tremembé",
    barClass: "bg-blue-900",
    textClass: "text-white",
  },
  {
    code: "MG",
    label: "Vila Maria / Vila Guilherme",
    barClass: "bg-cyan-500",
    textClass: "text-white",
  },
  {
    code: "ST",
    label: "Santana / Tucuruvi",
    barClass: "bg-yellow-400",
    textClass: "text-zinc-900",
  },
];

function DonutFinalizados({ pct }: { pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-8">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            className="stroke-zinc-200 dark:stroke-zinc-700"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            className="stroke-indigo-600 dark:stroke-indigo-400"
            strokeWidth="3"
            strokeDasharray={`${p}, 100`}
            strokeLinecap="round"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {p}%
          </span>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">finalizados</span>
        </div>
      </div>
      <div className="max-w-sm text-center sm:text-left">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Progresso do catálogo
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Percentual de setores com status &quot;Finalizado&quot; em relação ao total de setores do
          inventário.
        </p>
      </div>
    </div>
  );
}

export function DashboardHome({ sectorsTotal }: { sectorsTotal: number }) {
  const [bueirosCount, setBueirosCount] = useState<number | null>(null);
  const [totalQuantidade, setTotalQuantidade] = useState<number | null>(null);
  const [sectors, setSectors] = useState<SectorCompact[]>([]);
  const [prog, setProg] = useState<Record<string, SetorProgressoDoc>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const colRef = collection(db, "bueiros_registros");
        const agg = await getAggregateFromServer(colRef, {
          totalRegistros: count(),
          somaQuantidade: sum("quantidade"),
        });
        if (cancelled) return;
        const d = agg.data();
        setBueirosCount(d.totalRegistros);
        const q = d.somaQuantidade;
        setTotalQuantidade(typeof q === "number" && !Number.isNaN(q) ? q : 0);
      } catch {
        if (!cancelled) {
          setBueirosCount(0);
          setTotalQuantidade(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const unsub = onSnapshot(query(collection(db, "setores_progresso")), (snap) => {
      const m: Record<string, SetorProgressoDoc> = {};
      snap.forEach((d) => {
        m[d.id] = d.data() as SetorProgressoDoc;
      });
      setProg(m);
    });
    return unsub;
  }, []);

  const finalizados = useMemo(() => {
    let fin = 0;
    for (const s of sectors) {
      if (prog[s.setor]?.ultimoStatus === "finalizado") fin += 1;
    }
    return fin;
  }, [sectors, prog]);

  const pctSetores = useMemo(() => {
    if (!sectorsTotal) return 0;
    return Math.round((finalizados / sectorsTotal) * 1000) / 10;
  }, [finalizados, sectorsTotal]);

  const pctPorSub = useMemo(() => {
    const acc: Record<string, { total: number; fin: number }> = {};
    for (const c of SUB_CARDS) acc[c.code] = { total: 0, fin: 0 };
    for (const s of sectors) {
      const a = acc[s.subRegional];
      if (!a) continue;
      a.total += 1;
      if (prog[s.setor]?.ultimoStatus === "finalizado") a.fin += 1;
    }
    return acc;
  }, [sectors, prog]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-4xl">
          Visão geral
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Indicadores rápidos do inventário. Dados em tempo real.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Bueiros registrados</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {bueirosCount === null ? "…" : String(bueirosCount)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Total de pontos registrados</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total de bueiros</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {totalQuantidade === null ? "…" : String(totalQuantidade)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Soma das quantidades informadas nos registros</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:col-span-2 lg:col-span-1">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Setores finalizados</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {finalizados} / {sectorsTotal || "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{pctSetores}% do catálogo</p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Setores finalizados (global)
        </p>
        <DonutFinalizados pct={Math.round(pctSetores * 10) / 10} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SUB_CARDS.map((c) => {
          const { total, fin } = pctPorSub[c.code] ?? { total: 0, fin: 0 };
          const pct = total > 0 ? Math.round((fin / total) * 1000) / 10 : 0;
          return (
            <div
              key={c.code}
              className={`flex min-h-[120px] flex-col justify-between rounded-2xl p-4 ${c.barClass} ${c.textClass}`}
            >
              <p className="text-xs font-semibold leading-snug opacity-95">{c.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">{pct}%</p>
              <p className="mt-1 text-[11px] opacity-90">
                {fin} / {total} setores
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
        <p className="w-full text-sm font-medium text-zinc-600 dark:text-zinc-400">Ações rápidas</p>
        <Link
          href="/painel"
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Ver tabela de setores
        </Link>
        <Link
          href="/mapa"
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Abrir mapa
        </Link>
        <Link
          href="/exportar"
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Exportar planilha
        </Link>
      </div>
    </div>
  );
}
