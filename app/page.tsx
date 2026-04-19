"use client";

import { useAuthWeb } from "@/lib/contexts/AuthWebContext";
import { AppShell } from "./components/AppShell";
import { DashboardHome } from "./components/DashboardHome";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HomePage() {
  const { ready, profile, signInWithNome } = useAuthWeb();
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [sectorsTotal, setSectorsTotal] = useState(0);

  useEffect(() => {
    if (!profile?.nome) return;
    fetch("/sectors.compact.json")
      .then((r) => r.json())
      .then((j) => setSectorsTotal(Array.isArray(j.sectors) ? j.sectors.length : 0))
      .catch(() => setSectorsTotal(0));
  }, [profile?.nome]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = nome.trim();
    if (n.length < 2) return;
    setBusy(true);
    try {
      await signInWithNome(n);
      router.push("/");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (profile?.nome) {
    return (
      <>
        <AppShell>
          <DashboardHome sectorsTotal={sectorsTotal} />
        </AppShell>
        <p
          className="pointer-events-none fixed bottom-3 right-3 z-50 text-[11px] tabular-nums text-zinc-400 select-none dark:text-zinc-500"
          aria-hidden
        >
          1.0.0
        </p>
      </>
    );
  }

  return (
    <>
    <AppShell>
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">GeoDreno</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Painel web do inventário de bueiros.
          </p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Nome do operador
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Nome completo"
              autoComplete="name"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </AppShell>
    <p
      className="pointer-events-none fixed bottom-3 right-3 z-50 text-[11px] tabular-nums text-zinc-400 select-none dark:text-zinc-500"
      aria-hidden
    >
      1.0.0
    </p>
    </>
  );
}
