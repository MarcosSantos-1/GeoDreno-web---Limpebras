import { Navbar } from "../components/Navbar";

/** Shell em altura de viewport: mapa preenche o restante sem scroll na página. */
export default function MapaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Navbar />
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-3">
        {children}
      </main>
    </div>
  );
}
