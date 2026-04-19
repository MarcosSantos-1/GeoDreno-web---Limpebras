"use client";

import { useAuthWeb } from "@/lib/contexts/AuthWebContext";
import { useTheme } from "@/lib/contexts/ThemeContext";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const MapaClient = dynamic(() => import("./MapaClient"), { ssr: false });

export default function MapaPage() {
  const { ready, profile, user } = useAuthWeb();
  const { isDark } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (ready && !profile?.nome) router.replace("/");
  }, [ready, profile?.nome, router]);

  if (!ready || !profile?.nome) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <header className="shrink-0">
        <h1 className="text-xl font-bold lg:text-2xl">Mapa dos registros</h1>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          Todos os bueiros registrados pelo app (atualização em tempo real).
        </p>
      </header>
      <MapaClient
        isDark={isDark}
        userId={user?.uid ?? ""}
        displayName={profile?.nome ?? ""}
      />
    </div>
  );
}
