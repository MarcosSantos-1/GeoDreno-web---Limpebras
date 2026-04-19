"use client";

import { useAuthWeb } from "@/lib/contexts/AuthWebContext";
import { AppShell } from "../components/AppShell";
import { db } from "@/lib/firebase";
import { formatDateTimeBr } from "@/lib/format";
import {
  aggregateBueirosBySetor,
  displayUpdatedAt,
  effectiveRowStatus,
  type BueiroAgg,
} from "@/lib/setor-row-derive";
import type { SectorCompact, SetorProgressoDoc } from "@shared/firestore";
import { collection, doc, getDoc, onSnapshot, query } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SetorDetailModal } from "./SetorDetailModal";

type StatusFilter = "todos" | "em_execucao" | "pendente" | "finalizado";

export default function PainelPage() {
  const { ready, profile } = useAuthWeb();
  const router = useRouter();
  const [sectors, setSectors] = useState<SectorCompact[]>([]);
  const [prog, setProg] = useState<Record<string, SetorProgressoDoc>>({});
  const [search, setSearch] = useState("");
  const [sub, setSub] = useState<string>("ALL");
  const [statusTab, setStatusTab] = useState<StatusFilter>("todos");
  const [modalSetor, setModalSetor] = useState<string | null>(null);
  const [finalizadorNome, setFinalizadorNome] = useState<Record<string, string>>({});
  const [bueiroAgg, setBueiroAgg] = useState<Record<string, BueiroAgg>>({});

  useEffect(() => {
    if (!ready || !profile?.nome) return;
    fetch("/sectors.compact.json")
      .then((r) => r.json())
      .then((j) => setSectors(j.sectors ?? []))
      .catch(() => setSectors([]));
  }, [ready, profile?.nome]);

  useEffect(() => {
    if (!ready || !profile?.nome) return;
    const q = query(collection(db, "setores_progresso"));
    return onSnapshot(q, (snap) => {
      const m: Record<string, SetorProgressoDoc> = {};
      snap.forEach((d) => {
        m[d.id] = d.data() as SetorProgressoDoc;
      });
      setProg(m);
    });
  }, [ready, profile?.nome]);

  useEffect(() => {
    if (!ready || !profile?.nome) return;
    return onSnapshot(collection(db, "bueiros_registros"), (snap) => {
      setBueiroAgg(aggregateBueirosBySetor(snap.docs));
    });
  }, [ready, profile?.nome]);

  useEffect(() => {
    if (ready && !profile?.nome) router.replace("/");
  }, [ready, profile?.nome, router]);

  const subs = useMemo(() => {
    const u = new Set<string>();
    sectors.forEach((s) => u.add(s.subRegional));
    return ["ALL", ...[...u].sort()];
  }, [sectors]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...sectors]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => {
        const p = prog[s.setor];
        const progressStatus = (p?.ultimoStatus ?? "pendente") as
          | "em_execucao"
          | "pendente"
          | "finalizado";
        const agg = bueiroAgg[s.setor];
        const status = effectiveRowStatus(progressStatus, p?.updatedAt, agg);
        const updatedRaw = displayUpdatedAt(p?.updatedAt, agg);
        const regCount = agg?.count ?? 0;
        return {
          setor: s.setor,
          sub: s.subRegional,
          subprefeitura: s.subprefeitura,
          status,
          updatedRaw,
          ultimoUserId: p?.ultimoUserId,
          regCount,
        };
      })
      .filter((r) => {
        if (sub !== "ALL" && r.sub !== sub) return false;
        if (statusTab !== "todos" && r.status !== statusTab) return false;
        if (q) {
          const blob = `${r.setor} ${r.subprefeitura} ${r.sub}`.toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      });
  }, [sectors, prog, bueiroAgg, search, sub, statusTab]);

  const uidsToResolve = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.status === "finalizado" && r.ultimoUserId) ids.add(r.ultimoUserId);
    }
    return [...ids];
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        uidsToResolve.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "usuarios", uid));
            if (snap.exists()) next[uid] = (snap.data() as { nome?: string }).nome ?? uid;
            else next[uid] = "—";
          } catch {
            next[uid] = "—";
          }
        }),
      );
      if (!cancelled) {
        setFinalizadorNome((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uidsToResolve]);

  const openModal = useCallback((setor: string) => setModalSetor(setor), []);
  const closeModal = useCallback(() => setModalSetor(null), []);

  if (!ready || !profile?.nome) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <AppShell>
      <SetorDetailModal
        setor={modalSetor}
        open={modalSetor != null}
        onClose={closeModal}
        progress={modalSetor ? prog[modalSetor] : undefined}
      />

      <header className="mb-6">
        <h1 className="text-2xl font-bold lg:text-3xl">Setores</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Acompanhamento do progresso — {rows.length} linha(s) com os filtros atuais
        </p>
      </header>

      <div className="mb-6 flex flex-col gap-4">
        <div className="relative max-w-xl">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por setor, subprefeitura…"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sub:</span>
          {subs.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setSub(x)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                sub === x
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {x === "ALL" ? "Todas" : x}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
          {(
            [
              ["todos", "Todos"],
              ["em_execucao", "Em execução"],
              ["pendente", "Pendentes"],
              ["finalizado", "Finalizados"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusTab(key)}
              className={`rounded-t-lg px-3 py-2 text-sm font-semibold ${
                statusTab === key
                  ? "border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-semibold">Setor</th>
              <th className="px-4 py-3 font-semibold">Sub</th>
              <th className="px-4 py-3 font-semibold">Finalizado por</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Atualizado</th>
              <th className="px-4 py-3 font-semibold">Registros</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((r) => (
              <tr
                key={r.setor}
                role="button"
                tabIndex={0}
                onClick={() => openModal(r.setor)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openModal(r.setor);
                  }
                }}
                className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <td className="px-4 py-2 font-mono text-xs">{r.setor}</td>
                <td className="px-4 py-2">{r.sub}</td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {r.status === "finalizado" && r.ultimoUserId
                    ? (finalizadorNome[r.ultimoUserId] ?? "…")
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.status === "finalizado"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : r.status === "em_execucao"
                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                          : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {r.status === "finalizado"
                      ? "Finalizado"
                      : r.status === "em_execucao"
                        ? "Em execução"
                        : "Pendente"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {r.updatedRaw ? formatDateTimeBr(r.updatedRaw) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                  {r.regCount}{" "}
                  {r.regCount === 1 ? "registro" : "registros"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}
