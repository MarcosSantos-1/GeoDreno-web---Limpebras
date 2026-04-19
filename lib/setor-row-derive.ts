import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import type { BueiroRegistroDoc } from "@shared/firestore";
import {
  aggregateBueirosFromRegistros,
  displayUpdatedAt,
  effectiveRowStatus,
  type BueiroAgg,
  type ProgressStatus,
} from "@shared/setor-status";

export type { BueiroAgg, ProgressStatus };
export { displayUpdatedAt, effectiveRowStatus };

export function aggregateBueirosBySetor(
  docs: QueryDocumentSnapshot<DocumentData>[],
): Record<string, BueiroAgg> {
  const items: { setor: string; createdAt: string }[] = [];
  for (const d of docs) {
    const data = d.data() as BueiroRegistroDoc;
    if (!data.setor) continue;
    items.push({ setor: data.setor, createdAt: data.createdAt });
  }
  return aggregateBueirosFromRegistros(items);
}
