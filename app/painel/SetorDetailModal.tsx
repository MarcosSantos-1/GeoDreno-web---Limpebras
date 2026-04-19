"use client";

import { formatDateTimeBr } from "@/lib/format";
import { db } from "@/lib/firebase";
import { QuantidadeSelect } from "@/app/components/QuantidadeSelect";
import { coordToInputText, parseCoordText, sanitizeCoordInput } from "@/lib/parse-coord";
import { fetchReverseGeocode } from "@/lib/reverse-geocode-client";
import { tipoLabelBr } from "@/lib/mapa-shared";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { formatShortAddressFromGeocoded } from "@shared/format-short-address";
import {
  displayUpdatedAt,
  effectiveRowStatus,
  type BueiroAgg,
  type ProgressStatus,
} from "@shared/setor-status";
import type {
  BueiroRegistroDoc,
  BueiroTipo,
  SetorProgressoDoc,
  VisitaDoc,
} from "@shared/firestore";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

const SetorMiniMapInner = dynamic(() => import("./SetorMiniMapInner"), { ssr: false });

type Row = BueiroRegistroDoc & { id: string };

type Props = {
  setor: string | null;
  open: boolean;
  onClose: () => void;
  progress: SetorProgressoDoc | undefined;
};

export function SetorDetailModal({ setor, open, onClose, progress }: Props) {
  const { isDark } = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [statusDraft, setStatusDraft] = useState<SetorProgressoDoc["ultimoStatus"]>("pendente");
  const [savingStatus, setSavingStatus] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    tipo: "boca_lobo" as BueiroTipo,
    quantidade: 1,
    latText: "",
    lngText: "",
    numeracaoRelativa: "",
    enderecoManual: "",
  });
  const [savingRow, setSavingRow] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clickToPlace, setClickToPlace] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open || !setor) {
      setRows([]);
      return;
    }
    /** Só `where` — não exige índice composto; ordenação no cliente. */
    const q = query(collection(db, "bueiros_registros"), where("setor", "==", setor));
    return onSnapshot(
      q,
      (snap) => {
        setErr(null);
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as BueiroRegistroDoc),
        }));
        list.sort((a, b) => createdAtSortKey(b).localeCompare(createdAtSortKey(a)));
        setRows(list);
      },
      (e) => {
        console.error(e);
        const code = (e as { code?: string }).code;
        if (code === "permission-denied") {
          setErr("Sem permissão para listar registros deste setor.");
        } else {
          setErr("Não foi possível carregar os registros.");
        }
      },
    );
  }, [open, setor]);

  useEffect(() => {
    const st = progress?.ultimoStatus ?? "pendente";
    setStatusDraft(st);
  }, [progress?.ultimoStatus, open, setor]);

  const startEdit = useCallback((r: Row) => {
    setErr(null);
    setEditId(r.id);
    setForm({
      tipo: r.tipo,
      quantidade: r.quantidade,
      latText: coordToInputText(r.lat),
      lngText: coordToInputText(r.lng),
      numeracaoRelativa: r.numeracaoRelativa ?? "",
      enderecoManual: r.enderecoManual ?? "",
    });
    setClickToPlace(false);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditId(null);
    setClickToPlace(false);
  }, []);

  const saveRow = useCallback(async () => {
    if (!editId) return;
    setSavingRow(true);
    setErr(null);
    try {
      if (form.quantidade < 1 || form.quantidade > 100000) {
        setErr("Quantidade deve estar entre 1 e 100000.");
        return;
      }
      const lat = parseCoordText(form.latText);
      const lng = parseCoordText(form.lngText);
      if (lat == null || lng == null) {
        setErr("Latitude e longitude inválidas (use números; vírgula ou ponto como decimal).");
        return;
      }
      const nr = form.numeracaoRelativa.trim();
      const em = form.enderecoManual.trim();
      const geo = await fetchReverseGeocode(lat, lng);
      await updateDoc(doc(db, "bueiros_registros", editId), {
        tipo: form.tipo,
        quantidade: form.quantidade,
        lat,
        lng,
        numeracaoRelativa: nr ? nr : deleteField(),
        enderecoManual: em ? em : deleteField(),
        ...(geo ? { enderecoGeocodificado: geo } : {}),
      });
      cancelEdit();
    } catch (e) {
      console.error(e);
      setErr("Não foi possível salvar o registro.");
    } finally {
      setSavingRow(false);
    }
  }, [editId, form, cancelEdit]);

  const removeRow = useCallback(
    async (id: string) => {
      if (!window.confirm("Excluir este registro permanentemente?")) return;
      setDeletingId(id);
      setErr(null);
      try {
        await deleteDoc(doc(db, "bueiros_registros", id));
        if (editId === id) cancelEdit();
      } catch (e) {
        console.error(e);
        setErr("Não foi possível excluir.");
      } finally {
        setDeletingId(null);
      }
    },
    [editId, cancelEdit],
  );

  const editingRow = useMemo(() => rows.find((r) => r.id === editId) ?? null, [rows, editId]);

  const aggForSetor = useMemo((): BueiroAgg | undefined => {
    if (!rows.length) return undefined;
    let lastCreatedAt: string | null = null;
    for (const r of rows) {
      const c = r.createdAt;
      if (typeof c === "string" && (!lastCreatedAt || c > lastCreatedAt)) lastCreatedAt = c;
    }
    return { count: rows.length, lastCreatedAt };
  }, [rows]);

  const effectiveStatus = useMemo(
    () =>
      effectiveRowStatus(
        (progress?.ultimoStatus ?? "pendente") as ProgressStatus,
        progress?.updatedAt,
        aggForSetor,
      ),
    [progress?.ultimoStatus, progress?.updatedAt, aggForSetor],
  );

  const displayUpdatedAtStr = useMemo(
    () => displayUpdatedAt(progress?.updatedAt, aggForSetor),
    [progress?.updatedAt, aggForSetor],
  );
  const minimapLat = useMemo(
    () => parseCoordText(form.latText) ?? editingRow?.lat ?? -23.488481,
    [form.latText, editingRow?.lat],
  );
  const minimapLng = useMemo(
    () => parseCoordText(form.lngText) ?? editingRow?.lng ?? -46.609392,
    [form.lngText, editingRow?.lng],
  );

  const saveStatus = useCallback(async () => {
    if (!setor) return;
    const prev = progress?.ultimoStatus ?? "pendente";
    const next = statusDraft;
    if (next === prev) return;

    if (next === "pendente" && (prev === "em_execucao" || prev === "finalizado")) {
      const ok = window.confirm(
        "Confirmar reset do setor?\n\n" +
          "Todos os registros de bueiros deste setor serão excluídos no Firestore, visitas \"em execução\" serão canceladas (para alinhar o app mobile) e os dados de atualização do setor serão limpos.\n\n" +
          "Esta ação não pode ser desfeita.",
      );
      if (!ok) return;
      setSavingStatus(true);
      setErr(null);
      try {
        await deleteAllBueirosInSetor(setor);
        await cancelVisitasEmExecucaoNoSetor(setor);
        await setDoc(
          doc(db, "setores_progresso", setor),
          {
            ultimoStatus: "pendente",
            ultimaVisitaId: deleteField(),
            ultimoUserId: deleteField(),
            updatedAt: deleteField(),
          },
          { merge: true },
        );
        setToast("Setor voltou para Pendente; registros e visitas ativas foram limpos.");
      } catch (e) {
        console.error(e);
        setErr("Não foi possível concluir o reset do setor.");
      } finally {
        setSavingStatus(false);
      }
      return;
    }

    if (prev === "finalizado" && next === "em_execucao") {
      setSavingStatus(true);
      setErr(null);
      try {
        await setDoc(
          doc(db, "setores_progresso", setor),
          {
            ultimoStatus: "em_execucao",
            ultimaVisitaId: deleteField(),
            ultimoUserId: deleteField(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        setToast("Status: Em execução. Dados de finalização foram removidos.");
      } catch (e) {
        console.error(e);
        setErr("Não foi possível salvar o status.");
      } finally {
        setSavingStatus(false);
      }
      return;
    }

    setSavingStatus(true);
    setErr(null);
    try {
      await setDoc(
        doc(db, "setores_progresso", setor),
        {
          ultimoStatus: next,
          updatedAt: new Date().toISOString(),
        } as Partial<SetorProgressoDoc>,
        { merge: true },
      );
      setToast("Status do setor atualizado.");
    } catch (e) {
      console.error(e);
      setErr("Não foi possível salvar o status.");
    } finally {
      setSavingStatus(false);
    }
  }, [setor, statusDraft, progress?.ultimoStatus]);

  if (!open || !setor) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="setor-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="setor-modal-title" className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Setor {setor}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Registros de bueiros neste setor (painel web).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-900"
          >
            Fechar
          </button>
        </div>

        {toast ? (
          <div
            role="status"
            className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
          >
            {toast}
          </div>
        ) : null}

        {err && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Status do setor</h3>
          <div className="mb-3 space-y-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="flex flex-wrap items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">Lista e app (efetivo):</span>
              <StatusBadge status={effectiveStatus} />
            </p>
            {displayUpdatedAtStr ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                Última atividade (progresso ou último registro):{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {formatDateTimeBr(displayUpdatedAtStr)}
                </span>
              </p>
            ) : null}
            {(progress?.ultimoStatus ?? "pendente") === "pendente" &&
            effectiveStatus === "em_execucao" &&
            rows.length > 0 ? (
              <p className="leading-snug text-amber-800 dark:text-amber-200/95">
                O Firestore está como Pendente, mas há registros neste setor — o app e a tabela geral mostram{" "}
                <strong>Em execução</strong>. Para alinhar, altere o status abaixo ou use reset (Pendente com
                limpeza).
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusDraft}
              onChange={(e) =>
                setStatusDraft(e.target.value as SetorProgressoDoc["ultimoStatus"])
              }
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            >
              <option value="pendente">Pendente</option>
              <option value="em_execucao">Em execução</option>
              <option value="finalizado">Finalizado</option>
            </select>
            <button
              type="button"
              disabled={savingStatus || statusDraft === (progress?.ultimoStatus ?? "pendente")}
              onClick={saveStatus}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingStatus ? "Salvando…" : "Salvar status"}
            </button>
          </div>
        </section>

        {editId && (
          <section className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
            <h3 className="mb-3 text-sm font-semibold text-indigo-900 dark:text-indigo-200">
              Editar registro {editId.slice(0, 8)}…
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tipo
                <select
                  value={form.tipo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as BueiroTipo }))}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                >
                  <option value="boca_lobo">Boca de lobo</option>
                  <option value="boca_leao">Boca de leão</option>
                </select>
              </label>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Quantidade
                <QuantidadeSelect
                  value={form.quantidade}
                  onChange={(n) => setForm((f) => ({ ...f, quantidade: n }))}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Latitude
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.latText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, latText: sanitizeCoordInput(e.target.value) }))
                  }
                  placeholder="-23,488481"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Longitude
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.lngText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lngText: sanitizeCoordInput(e.target.value) }))
                  }
                  placeholder="-46,609392"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:col-span-2">
                Numeração relativa
                <input
                  value={form.numeracaoRelativa}
                  onChange={(e) => setForm((f) => ({ ...f, numeracaoRelativa: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:col-span-2">
                Endereço
                <input
                  value={form.enderecoManual}
                  onChange={(e) => setForm((f) => ({ ...f, enderecoManual: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setClickToPlace((c) => !c)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    clickToPlace
                      ? "bg-amber-500 text-white"
                      : "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {clickToPlace ? "Clique no mapa para posicionar (ativo)" : "Clicar no mapa para posicionar"}
                </button>
              </div>
              <SetorMiniMapInner
                lat={minimapLat}
                lng={minimapLng}
                isDark={isDark}
                clickToPlaceEnabled={clickToPlace}
                draggable
                onPositionChange={(la, ln) =>
                  setForm((f) => ({
                    ...f,
                    latText: sanitizeCoordInput(String(la)),
                    lngText: sanitizeCoordInput(String(ln)),
                  }))
                }
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingRow}
                onClick={saveRow}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingRow ? "Salvando…" : "Salvar registro"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                Cancelar edição
              </button>
            </div>
          </section>
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 font-semibold">Qtd</th>
                <th className="px-3 py-2 font-semibold">Endereço</th>
                <th className="px-3 py-2 font-semibold">Criado</th>
                <th className="px-3 py-2 font-semibold">Usuário</th>
                <th className="px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                    Nenhum registro neste setor.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                  <td className="px-3 py-2">{tipoLabelBr(r.tipo)}</td>
                  <td className="px-3 py-2">{r.quantidade}</td>
                  <td className="max-w-[min(16rem,40vw)] px-3 py-2 align-top text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="whitespace-normal break-words leading-snug">
                      {addressLineForRow(r)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {formatDateTimeBr(r.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.displayName ?? r.userId.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                        aria-label="Editar registro"
                        onClick={() => startEdit(r)}
                      >
                        <IconPencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30"
                        aria-label="Excluir registro"
                        disabled={deletingId === r.id}
                        onClick={() => removeRow(r.id)}
                      >
                        {deletingId === r.id ? (
                          <span className="text-xs">…</span>
                        ) : (
                          <IconTrash className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

async function deleteAllBueirosInSetor(setor: string): Promise<void> {
  const bq = query(collection(db, "bueiros_registros"), where("setor", "==", setor));
  const snap = await getDocs(bq);
  const chunk = 500;
  for (let i = 0; i < snap.docs.length; i += chunk) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + chunk)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

async function cancelVisitasEmExecucaoNoSetor(setor: string): Promise<void> {
  const vq = query(
    collection(db, "visitas"),
    where("setor", "==", setor),
    where("status", "==", "em_execucao"),
  );
  const snap = await getDocs(vq);
  const endedAt = new Date().toISOString();
  const chunk = 500;
  for (let i = 0; i < snap.docs.length; i += chunk) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + chunk)) {
      batch.update(d.ref, {
        status: "cancelada",
        endedAt,
      } as Partial<VisitaDoc>);
    }
    await batch.commit();
  }
}

function addressLineForRow(r: Row): string {
  const short = formatShortAddressFromGeocoded(r.enderecoGeocodificado);
  if (short) return short;
  const m = r.enderecoManual?.trim();
  if (m) return m;
  return "—";
}

function StatusBadge({ status }: { status: ProgressStatus }) {
  const cls =
    status === "finalizado"
      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
      : status === "em_execucao"
        ? "bg-amber-500/15 text-amber-900 dark:text-amber-200"
        : "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300";
  const label =
    status === "finalizado"
      ? "Finalizado"
      : status === "em_execucao"
        ? "Em execução"
        : "Pendente";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
      />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
    </svg>
  );
}

function createdAtSortKey(doc: BueiroRegistroDoc): string {
  const c = doc.createdAt as unknown;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "toDate" in (c as object)) {
    try {
      return (c as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

