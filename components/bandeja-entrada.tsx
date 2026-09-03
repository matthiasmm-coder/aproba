"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

export type FilaBandeja = {
  id: string; remitente: string; remitenteNombre: string | null; asunto: string | null; texto: string | null; recibidoAt: string;
  adjuntos: { nombre: string; mime: string; size: number; destino?: string; etiqueta?: string }[];
  clienteId: string | null; expedienteId: string | null; estado: string; motivo: string | null;
};
export type ClienteOpcion = { id: string; nombre: string; apellidos: string | null };
export type ExpedienteOpcion = { id: string; clienteId: string; referencia: string; tipo: string };

// Bandeja de entrada: emails con documentos que Aproba no ha podido atribuir solo
// (o que el gestor quiere revisar). Asignar = los adjuntos pasan al expediente vivo
// del cliente (o a su ficha); descartar = fuera.
export function BandejaEntrada({ pendientes, recientes, clientes, expedientes }: { pendientes: FilaBandeja[]; recientes: FilaBandeja[]; clientes: ClienteOpcion[]; expedientes: ExpedienteOpcion[] }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Record<string, { clienteId: string; expedienteId: string; q: string }>>({});

  const nombreCliente = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, `${c.nombre} ${c.apellidos ?? ""}`.trim()])), [clientes]);
  const expsPorCliente = useMemo(() => {
    const m: Record<string, ExpedienteOpcion[]> = {};
    for (const e of expedientes) (m[e.clienteId] ??= []).push(e);
    return m;
  }, [expedientes]);

  function estadoDe(id: string, fila: FilaBandeja) {
    return sel[id] ?? { clienteId: fila.clienteId ?? "", expedienteId: "", q: "" };
  }

  async function asignar(fila: FilaBandeja) {
    const s = estadoDe(fila.id, fila);
    if (!s.clienteId) { setError(t("Elige un cliente.")); return; }
    setBusy(fila.id); setError(null);
    try {
      const res = await fetch(`/api/bandeja/${fila.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clienteId: s.clienteId, expedienteId: s.expedienteId || null }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo asignar."));
      setHecho((h) => ({ ...h, [fila.id]: d.referencia ? `${t("Guardado en el expediente")} ${d.referencia}` : t("Guardado en la ficha del cliente") }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo asignar."));
    } finally { setBusy(null); }
  }

  async function descartar(fila: FilaBandeja) {
    if (!(await confirmar(t("¿Descartar este email? Sus adjuntos no se guardarán."))) ) return;
    setBusy(fila.id); setError(null);
    try {
      const res = await fetch(`/api/bandeja/${fila.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo descartar."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo descartar."));
    } finally { setBusy(null); }
  }

  const fecha = (s: string) => new Date(s).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const kb = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {pendientes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">{t("Nada por asignar.")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("Los emails que reenvíes a tu dirección de recepción y que Aproba no sepa de quién son aparecerán aquí.")}</p>
          <Link href="/app/ajustes?abrir=notificaciones" className="mt-3 inline-block text-xs font-medium text-aproba-700 underline underline-offset-2">{t("Ver mi dirección de recepción")}</Link>
        </div>
      ) : pendientes.map((fila) => {
        const s = estadoDe(fila.id, fila);
        const q = s.q.trim().toLowerCase();
        const opciones = q ? clientes.filter((c) => `${c.nombre} ${c.apellidos ?? ""}`.toLowerCase().includes(q)).slice(0, 30) : clientes.slice(0, 200);
        const exps = s.clienteId ? (expsPorCliente[s.clienteId] ?? []) : [];
        const ok = hecho[fila.id];
        return (
          <article key={fila.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{fila.remitenteNombre ? `${fila.remitenteNombre} · ` : ""}<span className="font-mono text-xs font-medium text-slate-500">{fila.remitente}</span></p>
                <p className="truncate text-sm text-slate-700">{fila.asunto || <span className="text-slate-400">{t("(sin asunto)")}</span>}</p>
              </div>
              <span className="text-xs text-slate-400">{fecha(fila.recibidoAt)}</span>
            </header>
            {fila.texto && <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-slate-500">{fila.texto}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {fila.adjuntos.length === 0 && <span className="text-xs text-slate-400">{t("Sin adjuntos admitidos (PDF, JPG, PNG, WebP hasta 8 MB).")}</span>}
              {fila.adjuntos.map((a, i) => (
                <a key={i} href={`/api/bandeja/${fila.id}/adjunto/${i}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-cream-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300">
                  <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  {a.nombre} <span className="text-slate-400">{kb(a.size)}</span>
                </a>
              ))}
            </div>
            {fila.motivo && fila.motivo !== "sin coincidencia" && <p className="mt-2 text-[11px] text-amber-700">{fila.motivo.startsWith("ambiguo") ? t("Varios clientes coinciden: elige el correcto.") : fila.motivo}</p>}

            {ok ? (
              <p className="mt-3 rounded-lg bg-aproba-50 px-3 py-2 text-sm font-medium text-aproba-700">{ok}</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                <label className="block text-xs text-slate-500">
                  <span className="mb-1 block font-medium uppercase tracking-wide text-slate-400">{t("Cliente")}</span>
                  <input value={s.q} onChange={(e) => setSel((m) => ({ ...m, [fila.id]: { ...s, q: e.target.value } }))} placeholder={t("Buscar por nombre…")} className="mb-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800" />
                  <select value={s.clienteId} onChange={(e) => setSel((m) => ({ ...m, [fila.id]: { ...s, clienteId: e.target.value, expedienteId: "" } }))} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800">
                    <option value="">{t("Elige un cliente")}</option>
                    {s.clienteId && !opciones.some((c) => c.id === s.clienteId) && <option value={s.clienteId}>{nombreCliente[s.clienteId] ?? s.clienteId}</option>}
                    {opciones.map((c) => <option key={c.id} value={c.id}>{nombreCliente[c.id]}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-slate-500">
                  <span className="mb-1 block font-medium uppercase tracking-wide text-slate-400">{t("Expediente")}</span>
                  <select value={s.expedienteId} onChange={(e) => setSel((m) => ({ ...m, [fila.id]: { ...s, expedienteId: e.target.value } }))} disabled={!s.clienteId} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 disabled:opacity-60">
                    <option value="">{exps.length === 1 ? `${t("Automático")} · ${exps[0].referencia}` : exps.length === 0 ? t("Sin expediente abierto · a la ficha") : t("A la ficha del cliente")}</option>
                    {exps.map((e) => <option key={e.id} value={e.id}>{e.referencia} · {e.tipo}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => asignar(fila)} disabled={busy === fila.id || !s.clienteId} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">{busy === fila.id ? "…" : t("Asignar")}</button>
                <button type="button" onClick={() => descartar(fila)} disabled={busy === fila.id} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-60">{t("Descartar")}</button>
              </div>
            )}
          </article>
        );
      })}

      {recientes.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Últimos emails colocados")}</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {recientes.map((fila) => (
              <li key={fila.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate text-slate-700">{fila.asunto || fila.remitente} <span className="text-slate-400">· {fila.adjuntos.length} {t("adjunto(s)")}</span></span>
                <span className="text-xs text-slate-500">
                  {fila.estado === "DESCARTADO" ? t("Descartado") : fila.clienteId ? <Link href={`/app/clientes/${fila.clienteId}`} className="font-medium text-aproba-700 hover:underline">{nombreCliente[fila.clienteId] ?? t("cliente")}</Link> : ""}
                  {fila.expedienteId && <> · <Link href={`/app/expedientes/${fila.expedienteId}`} className="font-medium text-aproba-700 hover:underline">{t("expediente")}</Link></>}
                  <span className="ml-2 text-slate-400">{fecha(fila.recibidoAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
