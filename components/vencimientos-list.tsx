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

// VIGÍA — lista agrupada de vencimientos + acción «Iniciar renovación».
// Al iniciar: (0) GET /api/vencimientos/[id]/renovar → servicios elegibles + sugerencia,
// que el gestor confirma o cambia en el diálogo (el precio se ve ANTES de avisar a
// nadie); (1) POST → expediente nuevo CON servicio + aviso al cliente en su idioma;
// (2) POST /api/pagos ANTICIPO (mejor esfuerzo: si el servicio no tiene anticipo
// configurado, se ignora — la lógica financiera vive en /api/pagos).

type Grupo = { key: string; titulo: string; tono: string; items: VencimientoRow[] };

type ServicioOpcion = { id: string; label: string; precioOculto: boolean; total: number | null; anticipo: number | null };
type Propuesta = { tipo: string; fecha: string; clienteNombre: string; sugerido: string | null; servicios: ServicioOpcion[] };

// Diálogo «Iniciar renovación»: el gestor ve QUÉ trámite se va a abrir y a qué precio,
// y lo cambia si la sugerencia no es la buena. Sin servicio elegido no hay botón:
// antes un pasaporte caducado abría una «Renovación de TIE» y, sin ese servicio, el
// cliente recibía un aviso de renovación sin saber de qué (11/09/2026).
function RenovacionDialog({ v, propuesta, cargando, adoptaEn, onConfirmar, onCerrar }: {
  v: VencimientoRow; propuesta: Propuesta | null; cargando: boolean; adoptaEn: string | null;
  onConfirmar: (servicioClave: string) => void; onCerrar: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [clave, setClave] = useState<string>("");
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  useEffect(() => { if (propuesta) setClave(propuesta.sugerido ?? ""); }, [propuesta]);
  const elegido = propuesta?.servicios.find((s) => s.id === clave) ?? null;
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
        <h2 id="renov-titulo" className="text-base font-bold text-slate-900">{t("Iniciar renovación")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{v.clienteNombre}</span> · {TIPO_VENCIMIENTO_LABEL[v.tipo] ?? v.tipo} · {fmtFechaCorta(v.fecha)}
        </p>

        {cargando || !propuesta ? (
          <p className="mt-4 text-sm text-slate-500">{t("Cargando servicios…")}</p>
        ) : propuesta.servicios.length === 0 ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t("No tienes ningún servicio activo. Configura uno en Ajustes › Servicios antes de iniciar la renovación.")}
          </p>
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
            </select>
            {!propuesta.sugerido && (
              <p className="mt-1.5 text-xs text-amber-700">{t("Ningún servicio del catálogo corresponde a este vencimiento: elige el que vas a tramitar.")}</p>
            )}
            {elegido && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {elegido.precioOculto
                  ? t("Precio a consultar: el cliente no verá importes.")
                  : elegido.total != null
                    ? <>{t("El cliente verá")} <strong>{eur(elegido.total)}</strong> {t("(IVA incluido)")}{elegido.anticipo != null ? <> · {t("anticipo")} <strong>{eur(elegido.anticipo)}</strong></> : null}.</>
                    : t("Este servicio no tiene tarifa: el cliente no verá importes.")}
              </p>
            )}
          </>
        )}

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {t("Se creará el expediente, se avisará a {nombre} en su idioma con el trámite y el precio y, si el servicio tiene anticipo, se emitirá la factura.").replace("{nombre}", v.clienteNombre)}
          {adoptaEn ? " " + t("El cliente no tiene oficina: se asignará a «{oficina}».").replace("{oficina}", adoptaEn) : ""}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={cerrar} className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-400">{t("Cancelar")}</button>
          <button
            type="button"
            disabled={!elegido}
            onClick={() => elegido && onConfirmar(elegido.id)}
            className="min-h-[44px] rounded-lg bg-aproba-600 px-4 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
          >
            {t("Iniciar renovación")}
          </button>
        </div>
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
  const [creado, setCreado] = useState<{ vencId: string; expedienteId: string; referencia: string; factura: "enviada" | "sin_tarifa" | "fallo" } | null>(null);
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
    const resto = vs.filter((v) => v.estado !== "TRAMITANDO");
    return [
      { key: "vencidos", titulo: t("Ya caducadas"), tono: "text-red-600", items: resto.filter((v) => v.dias < 0) },
      { key: "urgentes", titulo: t("Caducan en menos de 60 días"), tono: "text-amber-600", items: resto.filter((v) => v.dias >= 0 && v.dias <= 60) },
      // Un solo grupo para todo lo que caduca en más de 60 días (03/09: «En los próximos
      // 6 meses» fusionado aquí — el corte a 6 meses vive como indicador en Inicio).
      { key: "lejanos", titulo: t("Más adelante"), tono: "text-slate-500", items: resto.filter((v) => v.dias > 60) },
      { key: "tramitando", titulo: t("Renovación en marcha"), tono: "text-aproba-700", items: enMarcha },
    ].filter((g) => g.items.length > 0);
  }, [vencimientos, q, t]);

  async function iniciar(v: VencimientoRow) {
    // Cliente sin oficina en un despacho multi-oficina: desde «Todas» hay que elegir
    // pastilla primero; con pastilla activa, la renovación ADOPTA al cliente en ella.
    if (v.clienteSinSede && sedeCtx.multi && !sedeCtx.activa) {
      await confirmar({
        titulo: t("Elige una oficina"),
        mensaje: t("{nombre} no tiene oficina asignada y estás en «Todas» (vista de lectura). Elige arriba la pastilla de la oficina que llevará la renovación y vuelve a intentarlo.").replace("{nombre}", v.clienteNombre),
        confirmarLabel: t("Entendido"),
      });
      return;
    }
    // El clic abre el diálogo: servicio (sugerido o elegido) y precio se ven ANTES de
    // que nada salga hacia el cliente — un mis-tap en el móvil no debe notificar a nadie.
    setError(null);
    setDialogo({ v, propuesta: null, cargando: true });
    try {
      const res = await fetch(`/api/vencimientos/${v.id}/renovar`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo iniciar la renovación."));
      setDialogo({ v, propuesta: d as Propuesta, cargando: false });
    } catch (e) {
      setDialogo(null);
      setError(e instanceof Error ? e.message : t("No se pudo iniciar la renovación."));
    }
  }

  async function lanzar(v: VencimientoRow, servicioClave: string) {
    const adopta = v.clienteSinSede && sedeCtx.multi && sedeCtx.activa;
    setDialogo(null);
    setLanzando(v.id);
    setError(null);
    try {
      const res = await fetch(`/api/vencimientos/${v.id}/renovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servicioClave, ...(adopta ? { oficinaId: sedeCtx.activa } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo iniciar la renovación."));
      // Anticipo: si el servicio tiene tarifa, emite la factura + email IBAN. El resultado
      // se muestra de verdad (antes se silenciaba: el gestor no sabía si se cobró o no).
      let factura: "enviada" | "sin_tarifa" | "fallo" = "sin_tarifa";
      if (d.expedienteId && !d.yaExistia) {
        try {
          const rp = await fetch("/api/pagos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expedienteId: d.expedienteId, momento: "ANTICIPO" }),
          });
          const dp = await rp.json().catch(() => ({}));
          factura = rp.ok ? "enviada" : /no tiene pago configurado/i.test(String(dp.error ?? "")) ? "sin_tarifa" : "fallo";
        } catch {
          factura = "fallo";
        }
      }
      setCreado({ vencId: v.id, expedienteId: d.expedienteId, referencia: d.referencia ?? "", factura });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo iniciar la renovación."));
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
          onConfirmar={(clave) => lanzar(dialogo.v, clave)}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {creado && (
        <p className="mt-3 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-700">
          ✓ {t("Renovación iniciada")} — <Link href={`/app/expedientes/${creado.expedienteId}`} className="font-semibold underline">{creado.referencia || t("ver expediente")}</Link>. {t("El cliente ha recibido el enlace para revisar sus datos.")}{" "}
          {creado.factura === "enviada" && t("Factura de anticipo emitida y enviada.")}
          {creado.factura === "fallo" && <span className="font-semibold text-amber-700">{t("⚠ No se pudo emitir el anticipo — hazlo desde la ficha del expediente.")}</span>}
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
                      <p className="text-xs text-slate-500">{v.tipo} · {cuando} ({fmtFechaCorta(v.fecha)})</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {v.estado === "TRAMITANDO" && v.renovacion ? (
                        <Link href={`/app/expedientes/${v.renovacion.id}`} className="rounded-lg border border-aproba-300 px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50">
                          {v.renovacion.referencia} →
                        </Link>
                      ) : (
                        <button
                          onClick={() => iniciar(v)}
                          disabled={lanzando === v.id}
                          className="min-h-[40px] rounded-lg bg-aproba-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                        >
                          {lanzando === v.id ? t("Iniciando…") : t("Iniciar renovación")}
                        </button>
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
