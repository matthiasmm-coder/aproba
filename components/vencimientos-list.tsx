"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { VencimientoRow } from "@/lib/data/vencimientos";
import { fmtFechaCorta } from "@/lib/tramites";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { contextoDeTrabajoBrowser } from "@/lib/oficinas-browser";
import { eur } from "@/lib/facturas";
import { TIPO_VENCIMIENTO_LABEL } from "@/lib/renovacion-servicio";

// VIGÍA — lista agrupada de vencimientos (11/09/2026). Una sola acción para todos:
// «Proponer renovación» → POST …/renovar. Si el servicio se resuelve con certeza (TIE →
// Renovación de TIE) la propuesta sale sola; si no (pasaporte, NIE, servicio propio que
// encaja por nombre) llega 400 requiereServicio y se abre el diálogo: el gestor VALIDA,
// elige o CREA el servicio (nombre + anticipo/resto) y entonces se envía. El cliente
// recibe la propuesta con precio y responde con dos botones; NINGUNA factura sale hasta
// que acepte. Su respuesta se ve aquí: propuesta enviada / aceptada / rechazada.
// Camino secundario, solo en el diálogo y solo para pasaporte/NIE: «pedir solo el
// documento nuevo» (el despacho no tramita, el cliente lo renueva por su cuenta).

type Grupo = { key: string; titulo: string; tono: string; items: VencimientoRow[] };

type ServicioOpcion = { id: string; label: string; precioOculto: boolean; total: number | null; anticipo: number | null };
type Propuesta = { tipo: string; fecha: string; clienteNombre: string; sugerido: string | null; certeza: "seguro" | "probable" | null; nombreNuevo: string; servicios: ServicioOpcion[] };
type NuevoServicio = { label: string; anticipo: number; resto: number };
const NUEVO = "__nuevo__";

// Diálogo «Iniciar renovación»: el gestor ve QUÉ trámite se va a abrir y a qué precio,
// y lo cambia si la sugerencia no es la buena. Sin servicio elegido no hay botón:
// antes un pasaporte caducado abría una «Renovación de TIE» y, sin ese servicio, el
// cliente recibía un aviso de renovación sin saber de qué (11/09/2026).
function RenovacionDialog({ v, propuesta, cargando, adoptaEn, onConfirmar, onCrear, onSoloDocumento, onCerrar }: {
  v: VencimientoRow; propuesta: Propuesta | null; cargando: boolean; adoptaEn: string | null;
  onConfirmar: (servicioClave: string) => void; onCrear: (nuevo: NuevoServicio) => void; onSoloDocumento: () => void; onCerrar: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [clave, setClave] = useState<string>("");
  const [nuevo, setNuevo] = useState<{ label: string; anticipo: string; resto: string }>({ label: "", anticipo: "", resto: "" });
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  // Sin sugerencia: se abre directamente en «crear servicio» con el nombre propuesto — el
  // caso típico del pasaporte la primera vez (el gestor puede cambiar a uno existente).
  useEffect(() => { if (propuesta) { setClave(propuesta.sugerido ?? NUEVO); setNuevo((n) => ({ ...n, label: n.label || propuesta.nombreNuevo })); } }, [propuesta]);
  const elegido = propuesta?.servicios.find((s) => s.id === clave) ?? null;
  const creando = clave === NUEVO;
  const nuevoOk = creando && nuevo.label.trim().length > 0;
  const nuevoImportes = creando ? (() => { const a = Number(nuevo.anticipo) || 0, r = Number(nuevo.resto) || 0; const tot = Math.round((a * 1.21 + r * 1.21) * 100) / 100; return tot > 0 ? { total: tot, anticipo: a > 0 && r > 0 ? Math.round(a * 1.21 * 100) / 100 : null } : null; })() : null;
  const cerrar = () => { ref.current?.close(); onCerrar(); };
  return (
    <dialog
      ref={ref}
      aria-labelledby="renov-titulo"
      onCancel={(e) => { e.preventDefault(); cerrar(); }}
      onClick={(e) => { if (e.target === ref.current) cerrar(); }}
      className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <h2 id="renov-titulo" className="text-base font-bold text-slate-900">{t("Proponer renovación")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{v.clienteNombre}</span> · {TIPO_VENCIMIENTO_LABEL[v.tipo] ?? v.tipo} · {fmtFechaCorta(v.fecha)}
        </p>

        {cargando || !propuesta ? (
          <p className="mt-4 text-sm text-slate-500">{t("Cargando servicios…")}</p>
        ) : (
          <>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="renov-servicio">{t("Servicio de la renovación")}</label>
            <select
              id="renov-servicio"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[16px] sm:text-sm text-slate-800 outline-none focus:border-aproba-600"
            >
              <option value="">{t("— Elige el servicio —")}</option>
              {propuesta.servicios.map((s) => (
                <option key={s.id} value={s.id}>{s.label}{s.precioOculto ? ` · ${t("precio a consultar")}` : s.total != null ? ` · ${eur(s.total)}` : ""}</option>
              ))}
              <option value={NUEVO}>{t("+ Crear un servicio nuevo…")}</option>
            </select>
            {propuesta.certeza === "probable" && elegido && (
              <p className="mt-1.5 text-xs text-slate-500">{t("Sugerido por su nombre: confirma que es el trámite correcto.")}</p>
            )}
            {!propuesta.sugerido && !creando && (
              <p className="mt-1.5 text-xs text-amber-700">{t("Ningún servicio del catálogo corresponde a este vencimiento: elige el que vas a tramitar o crea uno.")}</p>
            )}
            {creando && (
              <div className="mt-3 space-y-2 rounded-lg border border-aproba-200 bg-aproba-50/50 p-3">
                <p className="text-xs text-slate-600">{t("Se guardará en tu catálogo (Ajustes › Servicios): la próxima vez saldrá solo.")}</p>
                <input value={nuevo.label} onChange={(e) => setNuevo({ ...nuevo, label: e.target.value })} placeholder={t("Nombre del servicio")} maxLength={80}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-800 outline-none focus:border-aproba-600" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-500">{t("Anticipo (€ sin IVA)")}
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={nuevo.anticipo} onChange={(e) => setNuevo({ ...nuevo, anticipo: e.target.value })} placeholder="0"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-800 outline-none focus:border-aproba-600" />
                  </label>
                  <label className="text-xs text-slate-500">{t("Resto al finalizar (€ sin IVA)")}
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={nuevo.resto} onChange={(e) => setNuevo({ ...nuevo, resto: e.target.value })} placeholder="0"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-800 outline-none focus:border-aproba-600" />
                  </label>
                </div>
              </div>
            )}
            {(elegido || creando) && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {creando
                  ? (nuevoImportes
                      ? <>{t("El cliente verá")} <strong>{eur(nuevoImportes.total)}</strong> {t("(IVA incluido)")}{nuevoImportes.anticipo != null ? <> · {t("anticipo")} <strong>{eur(nuevoImportes.anticipo)}</strong></> : null}.</>
                      : t("Este servicio no tiene tarifa: el cliente no verá importes."))
                  : elegido!.precioOculto
                    ? t("Precio a consultar: el cliente no verá importes.")
                    : elegido!.total != null
                      ? <>{t("El cliente verá")} <strong>{eur(elegido!.total)}</strong> {t("(IVA incluido)")}{elegido!.anticipo != null ? <> · {t("anticipo")} <strong>{eur(elegido!.anticipo)}</strong></> : null}.</>
                      : t("Este servicio no tiene tarifa: el cliente no verá importes.")}
              </p>
            )}
          </>
        )}

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {t("Se enviará la propuesta a {nombre} con el trámite y el precio; podrá aceptarla o rechazarla. No se emite ninguna factura hasta que acepte.").replace("{nombre}", v.clienteNombre)}
          {adoptaEn ? " " + t("El cliente no tiene oficina: se asignará a «{oficina}».").replace("{oficina}", adoptaEn) : ""}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={cerrar} className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-400">{t("Cancelar")}</button>
          <button
            type="button"
            disabled={!(elegido || nuevoOk)}
            onClick={() => { if (creando) { if (nuevoOk) onCrear({ label: nuevo.label.trim(), anticipo: Number(nuevo.anticipo) || 0, resto: Number(nuevo.resto) || 0 }); } else if (elegido) onConfirmar(elegido.id); }}
            className="min-h-[44px] rounded-lg bg-aproba-600 px-4 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
          >
            {creando ? t("Crear y enviar la propuesta") : t("Enviar la propuesta")}
          </button>
        </div>
        {/* Camino secundario: el despacho NO tramita (el cliente renueva su pasaporte por su cuenta). */}
        {v.documentoPropio && (
          <p className="mt-4 border-t border-slate-100 pt-3 text-center text-xs text-slate-500">
            {t("¿El despacho no va a tramitarlo?")}{" "}
            <button type="button" onClick={onSoloDocumento} className="font-semibold text-aproba-700 underline">{t("Pedir solo el documento nuevo")}</button>
          </p>
        )}
      </div>
    </dialog>
  );
}

export function VencimientosList({ vencimientos }: { vencimientos: VencimientoRow[] }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lanzando, setLanzando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
    const [creado, setCreado] = useState<{ vencId: string; expedienteId: string | null; referencia: string; modo: "propuesta" | "documento"; aviso: "ok" | "simulado" } | null>(null);
  // Cliente sin oficina + despacho multi-oficina: «Iniciar renovación» lo ADOPTA en la
  // pastilla activa (anunciado en el confirm) — y desde «Todas» se pide elegir antes.
  const [sedeCtx, setSedeCtx] = useState<{ multi: boolean; activa: string | null; nombreActiva: string | null }>({ multi: false, activa: null, nombreActiva: null });
  const [dialogo, setDialogo] = useState<{ v: VencimientoRow; propuesta: Propuesta | null; cargando: boolean } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const ctx = await contextoDeTrabajoBrowser(); // source unique de la règle pastille
        if (!ctx.multi) return;
        setSedeCtx({ multi: true, activa: ctx.activa, nombreActiva: ctx.nombreActiva });
      } catch { /* mono-oficina o sin migrar */ }
    })();
  }, []);

  const grupos = useMemo<Grupo[]>(() => {
    const filtro = q.trim().toLowerCase();
    const vs = filtro ? vencimientos.filter((v) => v.clienteNombre.toLowerCase().includes(filtro)) : vencimientos;
    const enMarcha = vs.filter((v) => v.estado === "TRAMITANDO");
    // Propuesta enviada (servicio) o documento pedido: la pelota está en el tejado del cliente.
    const esperando = vs.filter((v) => v.estado === "PROPUESTA" || v.estado === "SOLICITADO");
    const resto = vs.filter((v) => v.estado !== "TRAMITANDO" && v.estado !== "PROPUESTA" && v.estado !== "SOLICITADO");
    return [
      { key: "vencidos", titulo: t("Ya caducadas"), tono: "text-red-600", items: resto.filter((v) => v.dias < 0) },
      { key: "urgentes", titulo: t("Caducan en menos de 60 días"), tono: "text-amber-600", items: resto.filter((v) => v.dias >= 0 && v.dias <= 60) },
      // Un solo grupo para todo lo que caduca en más de 60 días (03/09: «En los próximos
      // 6 meses» fusionado aquí — el corte a 6 meses vive como indicador en Inicio).
      { key: "lejanos", titulo: t("Más adelante"), tono: "text-slate-500", items: resto.filter((v) => v.dias > 60) },
      { key: "esperando", titulo: t("Esperando al cliente"), tono: "text-amber-700", items: esperando },
      { key: "tramitando", titulo: t("Renovación aceptada · en marcha"), tono: "text-aproba-700", items: enMarcha },
    ].filter((g) => g.items.length > 0);
  }, [vencimientos, q, t]);

  // Un vencimiento sin sede en un despacho multi-oficina, desde «Todas»: elegir pastilla primero.
  function sinSedeDesdeTodas(v: VencimientoRow) { return v.clienteSinSede && sedeCtx.multi && !sedeCtx.activa; }
  async function avisarSede(v: VencimientoRow) {
    await confirmar({
      titulo: t("Elige una oficina"),
      mensaje: t("{nombre} no tiene oficina asignada y estás en «Todas» (vista de lectura). Elige arriba la pastilla de la oficina que llevará la renovación y vuelve a intentarlo.").replace("{nombre}", v.clienteNombre),
      confirmarLabel: t("Entendido"),
    });
  }

  // SERVICIO: proponer la renovación. Un clic; el diálogo solo aparece si ningún servicio encaja.
  async function proponer(v: VencimientoRow, servicioClave?: string, nuevoServicio?: NuevoServicio) {
    if (sinSedeDesdeTodas(v)) { await avisarSede(v); return; }
    const adopta = v.clienteSinSede && sedeCtx.multi && sedeCtx.activa;
    setDialogo(null);
    setLanzando(v.id);
    setError(null);
    try {
      const res = await fetch(`/api/vencimientos/${v.id}/renovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(servicioClave ? { servicioClave } : {}), ...(nuevoServicio ? { nuevoServicio } : {}), ...(adopta ? { oficinaId: sedeCtx.activa } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 400 && d.requiereServicio && !servicioClave && !nuevoServicio) {
        // Ningún servicio del catálogo corresponde: que el gestor elija (GET = servicios + sugerencia).
        setLanzando(null);
        setDialogo({ v, propuesta: null, cargando: true });
        const rg = await fetch(`/api/vencimientos/${v.id}/renovar`);
        const dg = await rg.json().catch(() => ({}));
        if (!rg.ok) throw new Error(dg.error ?? t("No se pudo proponer la renovación."));
        setDialogo({ v, propuesta: dg as Propuesta, cargando: false });
        return;
      }
      if (!res.ok) throw new Error(d.error ?? t("No se pudo proponer la renovación."));
      setCreado({ vencId: v.id, expedienteId: d.expedienteId, referencia: d.referencia ?? "", modo: "propuesta", aviso: d.avisoEnviado ? "ok" : "simulado" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo proponer la renovación."));
    } finally {
      setLanzando(null);
    }
  }

  // DOCUMENTO: pedir el documento renovado al cliente (email + su espacio). Sin expediente ni factura.
  async function pedirDocumento(v: VencimientoRow) {
    setLanzando(v.id);
    setError(null);
    try {
      const res = await fetch(`/api/vencimientos/${v.id}/solicitar-documento`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo pedir el documento."));
      setCreado({ vencId: v.id, expedienteId: null, referencia: "", modo: "documento", aviso: d.avisoEnviado ? "ok" : "simulado" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo pedir el documento."));
    } finally {
      setLanzando(null);
    }
  }

  // Eliminar un vencimiento del radar (dato estimado erróneo, cliente que ya no está,
  // duplicado, dato de prueba). NO borra el cliente ni el expediente — solo la alerta.
  async function eliminar(v: VencimientoRow) {
    if (!(await confirmar({
      titulo: t("Eliminar vencimiento"),
      mensaje: t("Se quitará el aviso de renovación de {nombre} del radar de Vigía. No se borra el cliente ni su expediente. ¿Eliminar?").replace("{nombre}", v.clienteNombre),
      confirmarLabel: t("Eliminar"),
      peligro: true,
    }))) return;
    setBorrando(v.id);
    setError(null);
    try {
      const res = await fetch(`/api/vencimientos/${v.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo eliminar el vencimiento."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar el vencimiento."));
    } finally {
      setBorrando(null);
    }
  }

  if (!vencimientos.length) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-3xl">🌱</p>
        <p className="mt-3 font-semibold text-slate-700">{t("Aún no hay vencimientos registrados")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          {t("Se rellenan solos: cuando la IA valida un TIE en el portal, o cuando finalizas un trámite que produce una tarjeta nueva.")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("Buscar cliente…")}
        className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-700 outline-none focus:border-aproba-600"
      />
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {dialogo && (
        <RenovacionDialog
          key={dialogo.v.id}
          v={dialogo.v}
          propuesta={dialogo.propuesta}
          cargando={dialogo.cargando}
          adoptaEn={dialogo.v.clienteSinSede && sedeCtx.multi && sedeCtx.activa ? (sedeCtx.nombreActiva ?? "") : null}
          onConfirmar={(clave) => proponer(dialogo.v, clave)}
          onCrear={(nuevo) => proponer(dialogo.v, undefined, nuevo)}
          onSoloDocumento={() => { const v = dialogo.v; setDialogo(null); pedirDocumento(v); }}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {creado && (
        <p className="mt-3 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-700">
          {creado.modo === "propuesta" ? (
            <>✓ {t("Propuesta enviada")} — {creado.expedienteId && <Link href={`/app/expedientes/${creado.expedienteId}`} className="font-semibold underline">{creado.referencia || t("ver expediente")}</Link>}. {t("Verás aquí si el cliente acepta o rechaza. No se emite ninguna factura hasta que acepte.")}</>
          ) : (
            <>✓ {t("Documento pedido al cliente")}. {t("Cuando lo suba, la fecha se actualizará sola y lo verás aquí.")}</>
          )}
          {creado.aviso === "simulado" && <span className="text-slate-500"> {t("(email simulado: sin servicio de correo en este entorno)")}</span>}
        </p>
      )}

      <div className="mt-4 space-y-6">
        {grupos.map((g) => (
          <div key={g.key}>
            <h2 className={`text-sm font-semibold uppercase tracking-wide ${g.tono}`}>{g.titulo} ({g.items.length})</h2>
            <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {g.items.map((v) => {
                const cuando = v.dias < 0
                  ? t("caducó hace {n} días").replace("{n}", String(-v.dias))
                  : v.dias === 0 ? t("caduca hoy")
                  : t("caduca en {n} días").replace("{n}", String(v.dias));
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.dias < 0 ? "bg-red-500" : v.dias <= 60 ? "bg-amber-400" : "bg-slate-300"}`} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/clientes/${v.clienteId}`} className="truncate text-sm font-semibold text-slate-800 hover:underline">{v.clienteNombre}</Link>
                      <p className="text-xs text-slate-500">{TIPO_VENCIMIENTO_LABEL[v.tipo] ?? v.tipo} · {cuando} ({fmtFechaCorta(v.fecha)})</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {v.estado === "PROPUESTA" ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          {t("Propuesta enviada")}{v.propuestaAt ? ` · ${fmtFechaCorta(v.propuestaAt)}` : ""} · {t("esperando respuesta")}
                        </span>
                      ) : v.estado === "SOLICITADO" ? (
                        <>
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            {t("Documento pedido")}{v.solicitadoAt ? ` · ${fmtFechaCorta(v.solicitadoAt)}` : ""}
                          </span>
                          <button onClick={() => pedirDocumento(v)} disabled={lanzando === v.id} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-50">{t("Volver a pedir")}</button>
                        </>
                      ) : v.estado === "TRAMITANDO" && v.renovacion ? (
                        <>
                          {v.respondidoAt && <span className="rounded-full bg-aproba-100 px-2.5 py-1 text-xs font-semibold text-aproba-700">{t("Aceptada")} · {fmtFechaCorta(v.respondidoAt)}</span>}
                          <Link href={`/app/expedientes/${v.renovacion.id}`} className="rounded-lg border border-aproba-300 px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50">
                            {v.renovacion.referencia} →
                          </Link>
                        </>
                      ) : (
                        <>
                          {v.estado === "RECHAZADA" && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">{t("Rechazada por el cliente")}{v.respondidoAt ? ` · ${fmtFechaCorta(v.respondidoAt)}` : ""}</span>}
                          {v.recibidoAt && v.estado === "PENDIENTE" && <span className="rounded-full bg-aproba-100 px-2.5 py-1 text-xs font-semibold text-aproba-700">{t("Documento nuevo recibido")} · {fmtFechaCorta(v.recibidoAt)}</span>}
                          <button
                            onClick={() => proponer(v)}
                            disabled={lanzando === v.id}
                            className="min-h-[40px] rounded-lg bg-aproba-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                          >
                            {lanzando === v.id ? t("Enviando…") : v.estado === "RECHAZADA" ? t("Proponer de nuevo") : t("Proponer renovación")}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => eliminar(v)}
                        disabled={borrando === v.id}
                        aria-label={t("Eliminar vencimiento")}
                        title={t("Eliminar vencimiento")}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
