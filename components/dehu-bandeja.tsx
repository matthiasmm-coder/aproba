"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { copiarTexto } from "@/lib/copiar";
import {
  TIPO_NOTIFICACION_LABEL, URL_DEHU, MAX_PDF_BYTES, MAX_ZIP_BYTES, diasHasta, normalizarNombre, claveNumero,
  type NotificacionDehu, type TipoNotificacion,
} from "@/lib/notificaciones-dehu";
import type { ExpedienteParaDehu } from "@/lib/data/notificaciones-dehu";

// PESTAÑA DEHú (Matthias, 28/09/2026). Dos entradas, una bandeja:
//  · el gestor arrastra los PDF (o el ZIP) que descarga de la DEHú → la IA lee cada uno y
//    PROPONE su expediente; un clic lo vincula y, si es un requerimiento, lo registra con su
//    plazo (el mismo requerimiento de la ficha, con sus avisos al despacho);
//  · los avisos de la DEHú que llegan a la dirección de Aproba → «ábrela antes del…».
// Nada se escribe en un expediente sin el clic del gestor. El único enlace a la DEHú es su
// dirección oficial: nunca uno sacado de un email.

type Traducir = (k: string) => string;
type Props = { items: NotificacionDehu[]; expedientes: ExpedienteParaDehu[]; direccion: string | null; faltaMigracion: boolean };
type Trabajo = { id: string; nombre: string; estado: "subiendo" | "leyendo" | "hecho" | "duplicada" | "no_es" | "error"; mensaje?: string; notifId?: string };
type Filtro = "revisar" | "gestionadas" | "ignoradas";

const EXT_OK = /\.(pdf|zip|jpe?g|png|webp)$/i;
const CONCURRENCIA = 3;

const CHIP_TIPO: Record<TipoNotificacion, string> = {
  REQUERIMIENTO: "bg-amber-100 text-amber-800",
  RESOLUCION_FAVORABLE: "bg-aproba-50 text-aproba-700",
  RESOLUCION_DESFAVORABLE: "bg-red-50 text-red-700",
  ARCHIVO: "bg-slate-100 text-slate-700",
  CITACION: "bg-sky-50 text-sky-700",
  ACUSE: "bg-slate-100 text-slate-600",
  OTRA: "bg-slate-100 text-slate-600",
  AVISO: "bg-violet-50 text-violet-700",
  VERIFICACION: "bg-violet-50 text-violet-700",
};

const fechaCorta = (iso: string | null | undefined) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m && iso.length <= 10) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
};
const isoDia = (iso: string | null | undefined) => {
  if (!iso) return "";
  if (iso.length <= 10) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
};
const hoyIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

function plazoTexto(n: NotificacionDehu, t: Traducir): { texto: string; tono: string } | null {
  if (!n.fechaLimite) return null;
  const d = diasHasta(n.fechaLimite);
  const tono = d < 0 ? "bg-red-50 text-red-700" : d <= 2 ? "bg-red-50 text-red-700" : d <= 5 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  if (n.tipo === "AVISO") {
    const cuando = d < 0 ? t("Plazo para abrirla vencido") : d === 0 ? t("Ábrela hoy") : d === 1 ? t("Ábrela mañana como tarde") : t("Quedan {n} días para abrirla").replace("{n}", String(d));
    return { texto: `${cuando} · ${t("hasta el")} ${fechaCorta(n.fechaLimite)}`, tono };
  }
  const cuando = d < 0 ? t("Venció hace {n} días").replace("{n}", String(-d)) : d === 0 ? t("Vence hoy") : d === 1 ? t("Vence mañana") : t("Quedan {n} días").replace("{n}", String(d));
  return { texto: `${t("Plazo")}: ${fechaCorta(n.fechaLimite)} · ${cuando}`, tono };
}

// Buscador de expedientes (vivos primero; también los archivados «en trámite»).
function SelectorExpediente({ expedientes, onElegir, t, autoFocus }: { expedientes: ExpedienteParaDehu[]; onElegir: (e: ExpedienteParaDehu) => void; t: Traducir; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const res = useMemo(() => {
    const nq = normalizarNombre(q);
    const cq = claveNumero(q);
    if (!nq && !cq) return [];
    return expedientes.filter((e) =>
      normalizarNombre(e.referencia).includes(nq) || normalizarNombre(e.cliente).includes(nq) || (cq.length >= 3 && claveNumero(e.numeroOficial).includes(cq)),
    ).slice(0, 8);
  }, [q, expedientes]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} placeholder={t("Buscar expediente: cliente, referencia o nº oficial")}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] outline-none focus:border-aproba-600 sm:text-sm" />
      {res.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-float">
          {res.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => { onElegir(e); setQ(""); }} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-cream-50">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-800">{e.cliente || t("Sin cliente")}</span>
                  <span className="block truncate text-xs text-slate-500">{e.referencia}{e.numeroOficial ? ` · ${e.numeroOficial}` : ""}</span>
                </span>
                {e.archivado && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">{t("Archivado")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && res.length === 0 && <p className="mt-1 text-xs text-slate-400">{t("Ningún expediente coincide.")}</p>}
    </div>
  );
}

function Tarjeta({ n, expedientes, porId, onCambio, t }: {
  n: NotificacionDehu; expedientes: ExpedienteParaDehu[]; porId: Map<string, ExpedienteParaDehu>; onCambio: (n: NotificacionDehu) => void; t: Traducir;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [guardarNumero, setGuardarNumero] = useState(true);
  const [formReq, setFormReq] = useState(false);
  const [reqAsunto, setReqAsunto] = useState(n.asunto ?? t("Requerimiento"));
  const [reqFecha, setReqFecha] = useState(isoDia(n.fechaLimite));
  const [reqDocs, setReqDocs] = useState(n.documentos.join("\n"));
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState(isoDia(n.fechaLimite));
  const [verMas, setVerMas] = useState(false);
  // Requerimiento ya creado en esta tarjeta: si falla el marcado, reintentar no lo duplica.
  const [reqCreado, setReqCreado] = useState<string | null>(null);

  const vinculado = n.expedienteId ? porId.get(n.expedienteId) ?? null : null;
  const sugerido = !n.expedienteId && n.sugerencia?.expedienteId ? porId.get(n.sugerencia.expedienteId) ?? null : null;
  const candidatos = !n.expedienteId && !sugerido ? (n.sugerencia?.candidatos ?? []).map((id) => porId.get(id)).filter((e): e is ExpedienteParaDehu => Boolean(e)) : [];
  const plazo = plazoTexto(n, t);
  const esAviso = n.origen === "AVISO_EMAIL";
  const abierta = n.estado === "PENDIENTE" || n.estado === "VINCULADA";
  const persona = [n.titularNombre, n.nie ? `NIE ${n.nie}` : null, n.pasaporte ? `${t("Pasaporte")} ${n.pasaporte}` : null].filter(Boolean).join(" · ");

  async function patch(cuerpo: Record<string, unknown>, clave: string): Promise<NotificacionDehu | null> {
    setOcupado(clave); setError(null);
    try {
      const res = await fetch(`/api/dehu/${n.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      onCambio(d.notificacion as NotificacionDehu);
      router.refresh();
      return d.notificacion as NotificacionDehu;
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo guardar.")); return null; }
    finally { setOcupado(null); }
  }

  const vincular = (e: ExpedienteParaDehu) => {
    setEligiendo(false);
    return patch({ accion: "vincular", expedienteId: e.id, guardarNumero: guardarNumero && Boolean(n.numeroExpediente) && !e.numeroOficial }, "vincular");
  };

  async function registrarRequerimiento() {
    if (!n.expedienteId) return;
    if (!reqAsunto.trim() || !reqFecha) { setError(t("Escribe qué te piden y la fecha límite.")); return; }
    setOcupado("req"); setError(null);
    try {
      let reqId = reqCreado;
      if (!reqId) {
        const res = await fetch(`/api/expedientes/${n.expedienteId}/requerimientos`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asunto: reqAsunto.trim(), fechaLimite: reqFecha, recibidoEl: n.fechaNotificacion ?? hoyIso(), docs: reqDocs.split("\n").map((d) => d.trim()).filter(Boolean), notas: t("Recibido en la DEHú") }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? t("No se pudo registrar el requerimiento."));
        reqId = (d.requerimiento?.id as string | undefined) ?? null;
        setReqCreado(reqId);
      }
      setOcupado(null);
      if (await patch({ accion: "gestionada", ...(reqId ? { requerimientoId: reqId } : {}) }, "req")) setFormReq(false);
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo registrar el requerimiento.")); setOcupado(null); }
  }

  async function registrarResolucion() {
    if (!n.expedienteId) return;
    setOcupado("res"); setError(null);
    try {
      const salida = n.tipo === "RESOLUCION_FAVORABLE" ? "concedido" : "denegado";
      const res = await fetch(`/api/expedientes/${n.expedienteId}/salida`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salida }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo registrar la resolución."));
      setOcupado(null);
      await patch({ accion: "gestionada" }, "res");
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo registrar la resolución.")); setOcupado(null); }
  }

  async function guardarCita() {
    if (!n.expedienteId || !n.cita) return;
    setOcupado("cita"); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${n.expedienteId}/avanzar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "cita", fecha: n.cita.fecha, hora: n.cita.hora ?? undefined, lugar: n.cita.lugar ?? undefined, notas: t("Citación recibida en la DEHú") }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar la cita."));
      setOcupado(null);
      await patch({ accion: "gestionada" }, "cita");
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo guardar la cita.")); setOcupado(null); }
  }

  async function eliminar() {
    if (!(await confirmar(t("¿Eliminar esta notificación? Se borra también el archivo.")))) return;
    setOcupado("eliminar"); setError(null);
    const res = await fetch(`/api/dehu/${n.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    setOcupado(null);
    if (!res.ok) { setError(d.error ?? t("No se pudo eliminar.")); return; }
    onCambio({ ...n, estado: "IGNORADA", id: `borrada:${n.id}` });
    router.refresh();
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50";
  const btnPrim = `${btn} bg-aproba-600 text-white hover:bg-aproba-700`;
  const btnSec = `${btn} border border-slate-300 bg-white text-slate-700 hover:border-slate-400`;
  const btnTexto = "text-xs font-semibold text-slate-500 transition hover:text-slate-800 disabled:opacity-50";

  return (
    <article className={`rounded-2xl border bg-white p-4 sm:p-5 ${abierta ? "border-slate-200" : "border-slate-100 opacity-90"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${CHIP_TIPO[n.tipo]}`}>{t(TIPO_NOTIFICACION_LABEL[n.tipo])}</span>
        {n.organismo && <span className="min-w-0 truncate text-xs text-slate-500">{n.organismo}</span>}
        <span className="ml-auto whitespace-nowrap text-xs text-slate-400">
          {esAviso ? t("Aviso por email") : t("PDF")} · {fechaCorta(n.fechaNotificacion ?? n.fechaPuestaDisposicion ?? n.fechaActo ?? n.createdAt)}
        </span>
      </div>

      <h3 className="mt-2 text-[15px] font-semibold text-slate-900">{n.asunto ?? t(TIPO_NOTIFICACION_LABEL[n.tipo])}</h3>
      {(persona || n.empresaNombre || n.numeroExpediente) && (
        <p className="mt-0.5 text-sm text-slate-600">
          {persona}{n.empresaNombre ? `${persona ? " · " : ""}${n.empresaNombre}` : ""}
          {n.numeroExpediente && <span className="text-slate-400">{persona || n.empresaNombre ? " · " : ""}{t("Exp.")} {n.numeroExpediente}</span>}
        </p>
      )}
      {n.resumen && <p className="mt-2 text-sm leading-relaxed text-slate-700">{n.resumen}</p>}

      {n.noEsNotificacion && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("La IA no lo reconoce como una notificación de la Administración.")}</p>
      )}

      {n.documentos.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Piden aportar")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {(verMas ? n.documentos : n.documentos.slice(0, 5)).map((d, i) => <li key={i}>{d}</li>)}
          </ul>
          {n.documentos.length > 5 && <button type="button" onClick={() => setVerMas((v) => !v)} className={`${btnTexto} mt-1`}>{verMas ? t("Ver menos") : t("Ver los {n}").replace("{n}", String(n.documentos.length))}</button>}
        </div>
      )}
      {n.tasas.length > 0 && (
        <p className="mt-2 text-sm text-slate-600">{t("Tasas")}: {n.tasas.map((x) => `${x.modelo}${x.importe ? ` (${x.importe.toFixed(2).replace(".", ",")} €)` : ""}`).join(" · ")}</p>
      )}
      {n.cita && (
        <p className="mt-2 text-sm text-slate-700"><span className="font-semibold">{t("Cita")}:</span> {fechaCorta(n.cita.fecha)}{n.cita.hora ? ` · ${n.cita.hora}` : ""}{n.cita.lugar ? ` · ${n.cita.lugar}` : ""}</p>
      )}
      {n.tipo === "VERIFICACION" && (
        <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
          {n.codigo
            ? <p>{t("Código de verificación")}: <b className="tracking-wider">{n.codigo}</b> — {t("escríbelo en la DEHú, en «Mis datos de contacto».")}</p>
            : <p>{t("Termina la verificación desde la DEHú, en «Mis datos de contacto». Por seguridad, Aproba no reenvía enlaces.")}</p>}
        </div>
      )}

      {plazo && abierta && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${plazo.tono}`}>{plazo.texto}</span>
          {!esAviso && !corrigiendo && <button type="button" onClick={() => setCorrigiendo(true)} className={btnTexto}>{t("Corregir")}</button>}
          {corrigiendo && (
            <span className="flex items-center gap-2">
              <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-[16px] sm:text-sm" />
              <button type="button" disabled={!nuevaFecha || ocupado !== null} onClick={async () => { const r = await patch({ accion: "plazo", fechaLimite: nuevaFecha }, "plazo"); if (r) { setCorrigiendo(false); setReqFecha(nuevaFecha); } }} className={btnSec}>{t("Guardar")}</button>
              <button type="button" onClick={() => setCorrigiendo(false)} className={btnTexto}>{t("Cancelar")}</button>
            </span>
          )}
        </div>
      )}
      {plazo && abierta && !esAviso && (
        <p className="mt-1 text-xs text-slate-400">
          {n.plazoDesdeHoy ? `${t("Contado desde el día de la importación: el PDF no dice cuándo se abrió. Corrígelo si la abriste antes.")} ` : ""}
          {n.plazoTipo === "HABILES" || (!n.plazoTipo && n.tipo === "REQUERIMIENTO") ? t("Días hábiles sin contar festivos: compruébalo.") : t("Si el último día es festivo, pasa al siguiente hábil: compruébalo.")}
        </p>
      )}
      {esAviso && abierta && n.tipo === "AVISO" && (
        <p className="mt-1 text-xs text-slate-400">{t("Pasados 10 días naturales sin abrirla, la notificación se da por rechazada y el procedimiento sigue.")}</p>
      )}

      {/* Expediente: vinculado, propuesto o por elegir. Un aviso sin propuesta no lo pide:
          se vincula al importar su PDF. */}
      {n.tipo !== "VERIFICACION" && n.estado !== "IGNORADA" && !(n.tipo === "AVISO" && !n.expedienteId && !n.sugerencia) && (
        <div className="mt-4 rounded-xl bg-cream-50 px-3 py-3">
          {vinculado ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">{t("Expediente")}:</span>
              <Link href={`/app/expedientes/${vinculado.id}`} className="font-semibold text-aproba-700 hover:underline">{vinculado.cliente || vinculado.referencia}</Link>
              <span className="text-xs text-slate-400">{vinculado.referencia}</span>
              {abierta && <button type="button" disabled={ocupado !== null} onClick={() => patch({ accion: "desvincular" }, "desvincular")} className={`${btnTexto} ml-auto`}>{t("Desvincular")}</button>}
            </div>
          ) : n.expedienteId ? (
            <p className="text-sm text-slate-500">{t("Vinculada a un expediente que no ves desde tu sede.")}</p>
          ) : (
            <div className="space-y-2">
              {sugerido ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-500">{t("Propuesta")}:</span>
                  <span className="font-semibold text-slate-800">{sugerido.cliente || sugerido.referencia}</span>
                  <span className="text-xs text-slate-400">{sugerido.referencia}{sugerido.archivado ? ` · ${t("archivado")}` : ""} · {t("por")} {t(n.sugerencia?.motivo ?? "")}</span>
                  <span className="ml-auto flex gap-2">
                    <button type="button" disabled={ocupado !== null} onClick={() => vincular(sugerido)} className={btnPrim}>{ocupado === "vincular" ? t("Vinculando…") : t("Vincular")}</button>
                    <button type="button" onClick={() => setEligiendo((v) => !v)} className={btnSec}>{t("Otro")}</button>
                  </span>
                </div>
              ) : candidatos.length > 0 ? (
                <div className="space-y-2 text-sm">
                  <p className="text-slate-500">{t("Esta persona tiene varios expedientes: elige cuál.")}</p>
                  <div className="flex flex-wrap gap-2">
                    {candidatos.map((e) => (
                      <button key={e.id} type="button" disabled={ocupado !== null} onClick={() => vincular(e)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-left transition hover:border-aproba-500 disabled:opacity-50">
                        <span className="block text-sm font-semibold text-slate-800">{e.cliente || e.referencia}</span>
                        <span className="block text-xs text-slate-400">{e.referencia}{e.archivado ? ` · ${t("archivado")}` : ""}</span>
                      </button>
                    ))}
                    {!eligiendo && <button type="button" onClick={() => setEligiendo(true)} className={btnTexto}>{t("Otro")}</button>}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-500">{t("Sin expediente propuesto.")}</span>
                  {!eligiendo && <button type="button" onClick={() => setEligiendo(true)} className={`${btnSec} ml-auto`}>{t("Elegir expediente")}</button>}
                </div>
              )}
              {eligiendo && <SelectorExpediente expedientes={expedientes} onElegir={vincular} t={t} autoFocus />}
              {n.numeroExpediente && (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" checked={guardarNumero} onChange={(e) => setGuardarNumero(e.target.checked)} className="h-3.5 w-3.5 accent-aproba-600" />
                  {t("Guardar el nº {num} como nº oficial del expediente (si no tiene)").replace("{num}", n.numeroExpediente)}
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lo que toca hacer */}
      {abierta && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {n.tipo === "AVISO" && (
            <>
              <a href={URL_DEHU} target="_blank" rel="noopener noreferrer" className={btnPrim}>{t("Abrir la DEHú")}</a>
              <button type="button" disabled={ocupado !== null} onClick={() => patch({ accion: "gestionada" }, "hecho")} className={btnSec}>{t("Ya la he abierto")}</button>
            </>
          )}
          {n.tipo === "VERIFICACION" && (
            <>
              <a href={URL_DEHU} target="_blank" rel="noopener noreferrer" className={btnPrim}>{t("Abrir la DEHú")}</a>
              <button type="button" disabled={ocupado !== null} onClick={() => patch({ accion: "gestionada" }, "hecho")} className={btnSec}>{t("Hecho")}</button>
            </>
          )}
          {!esAviso && n.expedienteId && n.tipo === "REQUERIMIENTO" && !formReq && (
            <button type="button" disabled={ocupado !== null} onClick={() => setFormReq(true)} className={btnPrim}>{t("Registrar el requerimiento")}</button>
          )}
          {!esAviso && n.expedienteId && (n.tipo === "RESOLUCION_FAVORABLE" || n.tipo === "RESOLUCION_DESFAVORABLE") && (
            <button type="button" disabled={ocupado !== null} onClick={registrarResolucion} className={btnPrim}>
              {ocupado === "res" ? t("Registrando…") : n.tipo === "RESOLUCION_FAVORABLE" ? t("Registrar: concedido") : t("Registrar: denegado")}
            </button>
          )}
          {!esAviso && n.expedienteId && n.tipo === "CITACION" && n.cita && (
            <button type="button" disabled={ocupado !== null} onClick={guardarCita} title={t("Como desde la ficha: si el aviso de cita está activo, el cliente recibe la fecha.")} className={btnPrim}>{ocupado === "cita" ? t("Guardando…") : t("Guardar la cita en el expediente")}</button>
          )}
          {!esAviso && (n.expedienteId || n.tipo === "ACUSE" || n.tipo === "OTRA") && !formReq && (
            <button type="button" disabled={ocupado !== null} onClick={() => patch({ accion: "gestionada" }, "hecho")} className={n.expedienteId && ["REQUERIMIENTO", "RESOLUCION_FAVORABLE", "RESOLUCION_DESFAVORABLE", "CITACION"].includes(n.tipo) ? btnTexto : btnSec}>{t("Marcar como gestionada")}</button>
          )}
          <span className="ml-auto flex items-center gap-3">
            {n.tieneArchivo && <a href={`/api/dehu/${n.id}/archivo`} target="_blank" rel="noopener noreferrer" className={btnTexto}>{t("Ver el PDF")}</a>}
            <button type="button" disabled={ocupado !== null} onClick={() => patch({ accion: "ignorar" }, "ignorar")} className={btnTexto}>{t("Ignorar")}</button>
          </span>
        </div>
      )}

      {formReq && n.expedienteId && (
        <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <label className="block text-xs font-semibold text-slate-600">{t("Qué te piden")}
            <input value={reqAsunto} onChange={(e) => setReqAsunto(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] font-normal outline-none focus:border-aproba-600 sm:text-sm" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">{t("Fecha límite")}
            <input type="date" value={reqFecha} onChange={(e) => setReqFecha(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-[16px] font-normal outline-none focus:border-aproba-600 sm:text-sm" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">{t("Documentos que piden (uno por línea)")}
            <textarea value={reqDocs} onChange={(e) => setReqDocs(e.target.value)} rows={Math.min(8, Math.max(2, n.documentos.length + 1))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] font-normal outline-none focus:border-aproba-600 sm:text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={ocupado !== null} onClick={registrarRequerimiento} className={btnPrim}>{ocupado === "req" ? t("Registrando…") : t("Registrar con avisos")}</button>
            <button type="button" onClick={() => setFormReq(false)} className={btnTexto}>{t("Cancelar")}</button>
            <span className="text-xs text-slate-500">{t("Queda en el expediente con su plazo; Aproba te avisa antes de que venza.")}</span>
          </div>
        </div>
      )}

      {!abierta && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            {n.estado === "GESTIONADA"
              ? n.cerradaPor ? t("Abierta: su PDF ya está importado.") : `${t("Gestionada")}${n.gestionadaAt ? ` ${t("el")} ${fechaCorta(n.gestionadaAt)}` : ""}${n.gestionadaPor ? ` · ${n.gestionadaPor}` : ""}${n.requerimientoId ? ` · ${t("requerimiento registrado")}` : ""}`
              : t("Ignorada")}
          </span>
          {n.tieneArchivo && <a href={`/api/dehu/${n.id}/archivo`} target="_blank" rel="noopener noreferrer" className={btnTexto}>{t("Ver el PDF")}</a>}
          <button type="button" disabled={ocupado !== null} onClick={() => patch({ accion: "reabrir" }, "reabrir")} className={btnTexto}>{n.noEsNotificacion ? t("Sí es una notificación") : t("Reabrir")}</button>
          {n.estado === "IGNORADA" && <button type="button" disabled={ocupado !== null} onClick={eliminar} className={`${btnTexto} hover:text-red-600`}>{t("Eliminar")}</button>}
        </div>
      )}

      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
    </article>
  );
}

export function DehuBandeja({ items, expedientes, direccion, faltaMigracion }: Props) {
  const t = useT();
  const router = useRouter();
  const [lista, setLista] = useState<NotificacionDehu[]>(items);
  const [filtro, setFiltro] = useState<Filtro>("revisar");
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [copiado, setCopiado] = useState<boolean | null>(null);
  const [comoFunciona, setComoFunciona] = useState(items.length === 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const porId = useMemo(() => new Map(expedientes.map((e) => [e.id, e])), [expedientes]);

  // Lo que el servidor manda después de router.refresh() gana a lo local (misma id).
  const [previos, setPrevios] = useState(items);
  if (previos !== items) { setPrevios(items); setLista(items); }

  // Lo que antes vence arriba: la verificación de la dirección primero (sin ella no llega
  // ningún aviso), luego por plazo o por fecha de la cita; lo que no tiene fecha, al final.
  const urgencia = (n: NotificacionDehu) => (n.tipo === "VERIFICACION" ? "0000" : n.fechaLimite ?? n.cita?.fecha ?? "9999");
  const revisar = lista.filter((n) => n.estado === "PENDIENTE" || n.estado === "VINCULADA")
    .sort((a, b) => urgencia(a).localeCompare(urgencia(b)) || b.createdAt.localeCompare(a.createdAt));
  const gestionadas = lista.filter((n) => n.estado === "GESTIONADA");
  const ignoradas = lista.filter((n) => n.estado === "IGNORADA");
  const visibles = filtro === "revisar" ? revisar : filtro === "gestionadas" ? gestionadas : ignoradas;
  const ocupados = trabajos.some((j) => j.estado === "subiendo" || j.estado === "leyendo");

  const cambiar = (nueva: NotificacionDehu) => setLista((l) => (nueva.id.startsWith("borrada:") ? l.filter((x) => x.id !== nueva.id.slice(8)) : l.map((x) => (x.id === nueva.id ? nueva : x))));
  const actualizarTrabajo = (id: string, c: Partial<Trabajo>) => setTrabajos((l) => l.map((j) => (j.id === id ? { ...j, ...c } : j)));

  // Un archivo ya en el bucket → lectura (un ZIP devuelve sus PDF, que se leen igual).
  async function importar(path: string, nombre: string, jobId: string, intento = 0): Promise<{ path: string; nombre: string }[]> {
    actualizarTrabajo(jobId, { estado: "leyendo" });
    const res = await fetch("/api/dehu/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, nombre }) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 503 && d.reintentar && intento < 1) { await new Promise((r) => setTimeout(r, 4000)); return importar(path, nombre, jobId, intento + 1); }
    if (!res.ok) { actualizarTrabajo(jobId, { estado: "error", mensaje: d.error ?? t("No se pudo leer.") }); return []; }
    if (d.zip) {
      actualizarTrabajo(jobId, { estado: "hecho", mensaje: t("ZIP abierto: {n} archivos").replace("{n}", String(d.entradas.length)) });
      return d.entradas as { path: string; nombre: string }[];
    }
    const fila = d.fila as NotificacionDehu | null;
    if (fila) setLista((l) => [fila, ...l.filter((x) => x.id !== fila.id)]);
    if (d.estado === "duplicada") actualizarTrabajo(jobId, { estado: "duplicada", mensaje: t("Ya estaba importada"), notifId: fila?.id });
    else if (d.estado === "no_es_notificacion") actualizarTrabajo(jobId, { estado: "no_es", mensaje: t("No parece una notificación: queda en «Ignoradas»"), notifId: fila?.id });
    else actualizarTrabajo(jobId, { estado: "hecho", mensaje: fila ? t(TIPO_NOTIFICACION_LABEL[fila.tipo]) : t("Importada"), notifId: fila?.id });
    return [];
  }

  async function subirUno(f: File, jobId: string): Promise<{ path: string; nombre: string }[]> {
    const res = await fetch("/api/dehu/subida", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: f.name, size: f.size }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { actualizarTrabajo(jobId, { estado: "error", mensaje: d.error ?? t("No se pudo subir.") }); return []; }
    // Tipo por extensión: Windows manda los ZIP como «x-zip-compressed» y a veces nada.
    const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? "";
    const tipo = ext === "zip" ? "application/zip" : ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    // El cliente de Supabase solo hace falta al subir: se carga entonces, no con la página.
    const { createSupabaseBrowser } = await import("@/lib/supabase/client");
    const up = await createSupabaseBrowser().storage.from("dehu-entrada").uploadToSignedUrl(d.path as string, d.token as string, f, { contentType: tipo });
    if (up.error) { actualizarTrabajo(jobId, { estado: "error", mensaje: t("No se pudo subir.") }); return []; }
    return importar(d.path as string, f.name, jobId);
  }

  async function procesar(files: File[]) {
    const pares = files.map((f) => ({ f, id: crypto.randomUUID() }));
    const nuevos: Trabajo[] = pares.map(({ f, id }) => {
      if (!EXT_OK.test(f.name)) return { id, nombre: f.name, estado: "error", mensaje: t("Formato no admitido (PDF, ZIP o imagen)") };
      const max = /\.zip$/i.test(f.name) ? MAX_ZIP_BYTES : MAX_PDF_BYTES;
      if (f.size > max) return { id, nombre: f.name, estado: "error", mensaje: t("Supera los {n} MB").replace("{n}", String(Math.round(max / 1024 / 1024))) };
      return { id, nombre: f.name, estado: "subiendo" };
    });
    setTrabajos((l) => [...nuevos, ...l].slice(0, 60));
    type Tarea = () => Promise<{ path: string; nombre: string }[]>;
    // Cola de 3 en 3: primero los archivos elegidos; los PDF de un ZIP se añaden al final.
    const cola: Tarea[] = pares.filter((_, i) => nuevos[i].estado === "subiendo").map(({ f, id }) => () => subirUno(f, id));
    const trabajar = async () => {
      for (let tarea = cola.shift(); tarea; tarea = cola.shift()) {
        try {
          const extra = await tarea();
          for (const e of extra) {
            const id = crypto.randomUUID();
            setTrabajos((l) => [{ id, nombre: e.nombre, estado: "leyendo" }, ...l]);
            cola.push(() => importar(e.path, e.nombre, id));
          }
        } catch { /* el trabajo ya dice su error */ }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCIA }, trabajar));
    if (fileRef.current) fileRef.current.value = "";
    setFiltro("revisar");
    router.refresh();
  }

  const soltar = (e: React.DragEvent) => { e.preventDefault(); setArrastrando(false); if (e.dataTransfer.files?.length) void procesar(Array.from(e.dataTransfer.files)); };
  const ETIQUETA_TRABAJO: Record<Trabajo["estado"], string> = {
    subiendo: t("Subiendo…"), leyendo: t("Leyendo con IA…"), hecho: t("Importada"), duplicada: t("Ya estaba"), no_es: t("Revisar"), error: t("Error"),
  };
  const TONO_TRABAJO: Record<Trabajo["estado"], string> = {
    subiendo: "text-slate-500", leyendo: "text-aproba-700", hecho: "text-aproba-700", duplicada: "text-slate-500", no_es: "text-amber-700", error: "text-red-600",
  };

  if (faltaMigracion) {
    return <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("La pestaña DEHú necesita una actualización de la base de datos. Avisa al soporte de Aproba.")}</p>;
  }

  return (
    <div className="space-y-5">
      {/* Importar + dirección de avisos */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={soltar}
          className={`rounded-2xl border-2 border-dashed p-5 transition lg:col-span-3 ${arrastrando ? "border-aproba-500 bg-aproba-50/60" : "border-slate-300 bg-white"}`}
        >
          <p className="text-sm font-semibold text-slate-900">{t("Importa las notificaciones que ya abriste")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("Arrastra aquí los PDF o el ZIP que descargas de la DEHú. La IA lee cada una (tipo, persona, nº de expediente, plazo y documentos pedidos) y te propone su expediente: nada se vincula sin tu clic.")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" multiple accept=".pdf,.zip,.jpg,.jpeg,.png,.webp,application/pdf,application/zip,image/*" className="hidden" onChange={(e) => e.target.files && void procesar(Array.from(e.target.files))} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={ocupados} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
              {ocupados ? t("Leyendo…") : t("Elegir archivos")}
            </button>
            <span className="text-xs text-slate-400">{t("PDF, ZIP o foto · hasta {n} archivos por ZIP").replace("{n}", "40")}</span>
          </div>
          {trabajos.length > 0 && (
            <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto border-t border-slate-100 pt-3">
              {trabajos.map((j) => (
                <li key={j.id} className="flex items-center gap-3 text-xs">
                  <span className="min-w-0 flex-1 truncate text-slate-600" title={j.nombre}>{j.nombre}</span>
                  <span className={`shrink-0 font-semibold ${TONO_TRABAJO[j.estado]}`}>{j.mensaje && j.estado !== "subiendo" && j.estado !== "leyendo" ? j.mensaje : ETIQUETA_TRABAJO[j.estado]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <p className="text-sm font-semibold text-slate-900">{t("Recibe aquí los avisos de la DEHú")}</p>
          {direccion ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-cream-50 px-2.5 py-1.5 text-xs text-slate-700" title={direccion}>{direccion}</code>
                <button type="button" onClick={async () => setCopiado(await copiarTexto(direccion))} className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400">{copiado ? t("Copiada") : t("Copiar")}</button>
              </div>
              {copiado === false && <p className="mt-1 text-xs text-amber-700">{t("No se pudo copiar: selecciona la dirección y cópiala a mano.")}</p>}
              <button type="button" onClick={() => setComoFunciona((v) => !v)} className="mt-2 text-xs font-semibold text-aproba-700 hover:underline">{comoFunciona ? t("Ocultar cómo se configura") : t("Cómo se configura")}</button>
              {comoFunciona && (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
                  <li>{t("Entra en la DEHú con tu certificado.")} <a href={URL_DEHU} target="_blank" rel="noopener noreferrer" className="font-semibold text-aproba-700 hover:underline">dehu.redsara.es</a></li>
                  <li>{t("En «Mis datos de contacto», añade esta dirección como correo de aviso (la tuya sigue igual).")}</li>
                  <li>{t("Cada aviso aparecerá aquí con los 10 días naturales para abrirla, y en la campana.")}</li>
                  <li>{t("¿Te llega una notificación en PDF? Reenvíala a esta misma dirección: se importa sola.")}</li>
                </ol>
              )}
              <p className="mt-2 text-xs text-slate-400">{t("Por seguridad, Aproba nunca te manda a un enlace de un email: la DEHú, siempre desde su dirección oficial.")}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">{t("La dirección de recepción aún no está disponible. Vuelve a intentarlo en unos minutos.")}</p>
          )}
        </div>
      </section>

      {/* Bandeja */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["revisar", t("Por revisar"), revisar.length],
          ["gestionadas", t("Gestionadas"), gestionadas.length],
          ["ignoradas", t("Ignoradas"), ignoradas.length],
        ] as [Filtro, string, number][]).map(([k, label, num]) => (
          <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${filtro === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"}`}>
            {label} <span className={filtro === k ? "text-slate-300" : "text-slate-400"}>{num}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">{filtro === "revisar" ? t("Nada pendiente") : filtro === "gestionadas" ? t("Aún no hay notificaciones gestionadas") : t("No hay notificaciones ignoradas")}</p>
          {filtro === "revisar" && <p className="mt-1 text-sm text-slate-500">{t("Importa las notificaciones de la DEHú o añade tu dirección de avisos: todo lo que llegue aparecerá aquí.")}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((n) => <Tarjeta key={n.id} n={n} expedientes={expedientes} porId={porId} onCambio={cambiar} t={t} />)}
        </div>
      )}
    </div>
  );
}
