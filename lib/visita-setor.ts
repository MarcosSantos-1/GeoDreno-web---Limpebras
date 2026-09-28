import { db } from "@/lib/firebase";
import type { SetorProgressoDoc, VisitaDoc } from "@shared/firestore";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

/**
 * Abre (ou reaproveita) a visita em execução deste usuário no setor
 * e marca `setores_progresso`, no mesmo formato do app de campo.
 */
export async function iniciarMapaWeb(setor: string, userId: string): Promise<string> {
  const q = query(
    collection(db, "visitas"),
    where("userId", "==", userId),
    where("setor", "==", setor),
    where("status", "==", "em_execucao"),
    limit(1),
  );
  const snap = await getDocs(q);
  const startedAt = new Date().toISOString();
  const visitaId = snap.empty
    ? (
        await addDoc(collection(db, "visitas"), {
          userId,
          setor,
          status: "em_execucao",
          startedAt,
        } as VisitaDoc)
      ).id
    : snap.docs[0].id;

  await setDoc(
    doc(db, "setores_progresso", setor),
    {
      ultimoStatus: "em_execucao",
      ultimaVisitaId: visitaId,
      ultimoUserId: userId,
      updatedAt: startedAt,
    } as SetorProgressoDoc,
    { merge: true },
  );
  return visitaId;
}

/**
 * Fecha as visitas em execução deste usuário no setor e marca o mapa como finalizado.
 * Não apaga pontos. Mapas só com bueiro lançado no web também podem ser finalizados aqui.
 */
export async function finalizarMapaWeb(setor: string, userId: string): Promise<void> {
  const endedAt = new Date().toISOString();
  const q = query(
    collection(db, "visitas"),
    where("userId", "==", userId),
    where("setor", "==", setor),
    where("status", "==", "em_execucao"),
  );
  const snap = await getDocs(q);
  await Promise.all(
    snap.docs.map((d) =>
      updateDoc(doc(db, "visitas", d.id), {
        status: "finalizada",
        endedAt,
      } as Partial<VisitaDoc>),
    ),
  );
  const ultimaVisitaId = snap.docs[0]?.id;
  await setDoc(
    doc(db, "setores_progresso", setor),
    {
      ultimoStatus: "finalizado",
      ...(ultimaVisitaId ? { ultimaVisitaId } : {}),
      ultimoUserId: userId,
      updatedAt: endedAt,
    } as SetorProgressoDoc,
    { merge: true },
  );
}
