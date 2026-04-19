/** Parte data/hora de um ISO em `pt-BR` / `America/Sao_Paulo` (exportação planilhas). */
export function splitDateTimeExport(iso: string): { data: string; hora: string } {
  if (!iso || iso === "—") return { data: "", hora: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { data: "", hora: "" };
  const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { data, hora };
}

/** ISO 8601 → ex.: `17/04/2026 - 01:36` (fuso America/Sao_Paulo) */
export function formatDateTimeBr(iso: string): string {
  if (!iso || iso === "—") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${data} - ${hora}`;
}
