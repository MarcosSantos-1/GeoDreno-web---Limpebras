"use client";

import type { SectorCompact } from "@shared/firestore";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type Props = {
  sectors: SectorCompact[];
  value: string;
  onChange: (setor: string) => void;
  disabled?: boolean;
};

export function SectorCombobox({ sectors, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = useMemo(() => sectors.find((s) => s.setor === value), [sectors, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...sectors].sort((a, b) => a.orderIndex - b.orderIndex);
    if (!q) return sorted;
    return sorted.filter(
      (s) =>
        s.setor.toLowerCase().includes(q) ||
        s.logradouro.toLowerCase().includes(q) ||
        (s.subprefeitura ?? "").toLowerCase().includes(q) ||
        s.subRegional.toLowerCase().includes(q),
    );
  }, [sectors, query]);

  const updateAnchor = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    updateAnchor();
    const onScroll = () => updateAnchor();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, updateAnchor]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      const portal = document.getElementById("sector-combobox-portal");
      if (portal?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback(() => {
    if (disabled) return;
    setOpen((o) => {
      if (!o) setQuery("");
      return !o;
    });
  }, [disabled]);

  const dropdown =
    open &&
    anchor &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        id="sector-combobox-portal"
        className="fixed z-10000 flex max-h-[min(280px,50vh)] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-600 dark:bg-zinc-950"
        style={{
          top: anchor.top,
          left: anchor.left,
          width: Math.max(anchor.width, 200),
        }}
        role="listbox"
      >
        <div className="shrink-0 border-b border-zinc-200 p-2 dark:border-zinc-700">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar código, logradouro, sub…"
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            autoFocus
            autoComplete="off"
          />
        </div>
        <ul className="scrollbar-none min-h-0 flex-1 overflow-y-auto py-1 text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-zinc-500">Nenhum setor encontrado.</li>
          ) : (
            filtered.map((s) => (
              <li key={s.setor}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === s.setor}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-purple-50 dark:hover:bg-purple-950/40 ${
                    value === s.setor ? "bg-purple-100/80 dark:bg-purple-900/30" : ""
                  }`}
                  onClick={() => {
                    onChange(s.setor);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">{s.setor}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">{s.logradouro}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>,
      document.body,
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-left text-sm text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            <>
              <span className="font-mono text-xs">{selected.setor}</span>
              <span className="text-zinc-600 dark:text-zinc-400"> — {selected.logradouro}</span>
            </>
          ) : (
            <span className="text-zinc-500">Selecione o setor…</span>
          )}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
