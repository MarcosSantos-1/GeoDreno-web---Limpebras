/**
 * Regras compartilhadas painel web + lista mobile: status “efetivo” e agregação de bueiros por setor.
 * Mantido em sync com `shared/setor-status.ts` na raiz do monorepo (mobile).
 */

export type BueiroAgg = { count: number; lastCreatedAt: string | null };

export type ProgressStatus = "pendente" | "em_execucao" | "finalizado";

export function aggregateBueirosFromRegistros(
  items: { setor: string; createdAt: string }[],
): Record<string, BueiroAgg> {
  const m: Record<string, BueiroAgg> = {};
  for (const item of items) {
    const setor = item.setor;
    if (!setor) continue;
    const cur = m[setor] ?? { count: 0, lastCreatedAt: null };
    cur.count += 1;
    const c = item.createdAt;
    if (c && (!cur.lastCreatedAt || c > cur.lastCreatedAt)) cur.lastCreatedAt = c;
    m[setor] = cur;
  }
  return m;
}

export function displayUpdatedAt(
  progressUpdatedAt: string | undefined,
  agg: BueiroAgg | undefined,
): string | undefined {
  const b = agg?.lastCreatedAt;
  if (!progressUpdatedAt && !b) return undefined;
  if (!progressUpdatedAt) return b ?? undefined;
  if (!b) return progressUpdatedAt;
  return progressUpdatedAt > b ? progressUpdatedAt : b;
}

export function effectiveRowStatus(
  progressStatus: ProgressStatus,
  progressUpdatedAt: string | undefined,
  agg: BueiroAgg | undefined,
): ProgressStatus {
  const lastBueiro = agg?.lastCreatedAt ?? null;
  const progAt = progressUpdatedAt ?? null;
  const hasBueiros = (agg?.count ?? 0) > 0;

  if (lastBueiro && progAt && lastBueiro > progAt) {
    return "em_execucao";
  }
  if (progressStatus === "pendente" && hasBueiros) {
    return "em_execucao";
  }
  return progressStatus;
}
