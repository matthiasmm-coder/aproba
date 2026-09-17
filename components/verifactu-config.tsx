"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// Ajustes › Facturación › VERI*FACTU (17/09/2026). Por cada NIF que emite facturas (el del
// despacho y las oficinas con NIF propio): estado del envío a la AEAT, clave de empresa
// Verifacti (se guarda cifrada, nunca vuelve al navegador), pausa y retirada. Quien no
// quiera tocar nada pulsa «Quiero activarlo» y Aproba se encarga del alta y del modelo de
// representación. El recuento de registros dice si la AEAT está aceptando las facturas.

type Nif = { nif: string; nombre: string; origen: "despacho" | "oficina" };
type Config = { nif: string; entorno: "test" | "prod"; activo: boolean; configurado: boolean; ultimaComprobacion: string | null; ultimoError: string | null };
type Estado = { nifs: Nif[]; configs: Config[]; resumen: Record<string, number>; declaracion: string | null; migracion: boolean };

const PROBLEMAS = ["INCORRECTO", "ACEPTADO_CON_ERRORES", "DUPLICADO", "NO_REGISTRADO", "ERROR_ENVIO", "BLOQUEADO"];

export function VerifactuConfig() {
  const t = useT();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [editando, setEditando] = useState<string | null>(null); // NIF cuya clave se está pegando
  const [clave, setClave] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solicitado, setSolicitado] = useState(false);

  useEffect(() => {
    fetch("/api/ajustes/verifactu").then((r) => r.json()).then((d) => setEstado(d.error ? null : d)).catch(() => setEstado(null));
  }, []);

  async function llamar(method: "POST" | "PATCH" | "DELETE", body?: unknown, query = "") {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/ajustes/verifactu${query}`, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      if (d.nifs) setEstado(d);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
      return null;
    } finally { setBusy(false); }
  }

  async function guardar(nif: string) {
    const d = await llamar("POST", { nif, apiKey: clave.trim() });
    if (d) { setEditando(null); setClave(""); }
  }
  async function pausar(c: Config) {
    if (c.activo && !(await confirmar(t("¿Pausar el envío a la AEAT para este NIF? Las facturas que emitas mientras tanto no se registrarán.")))) return;
    await llamar("PATCH", { nif: c.nif, activo: !c.activo });
  }
  async function quitar(c: Config) {
    if (!(await confirmar(t("¿Retirar la clave de Verifacti de este NIF? Los registros ya enviados se conservan.")))) return;
    await llamar("DELETE", undefined, `?nif=${encodeURIComponent(c.nif)}`);
  }
  async function solicitar() {
    const d = await llamar("POST", { accion: "solicitar" });
    if (d?.solicitado) setSolicitado(true);
  }

  const total = Object.values(estado?.resumen ?? {}).reduce((a, b) => a + b, 0);
  const problemas = PROBLEMAS.reduce((a, k) => a + (estado?.resumen?.[k] ?? 0), 0);
  const pendientes = estado?.resumen?.PENDIENTE ?? 0;
  const algunoActivo = (estado?.configs ?? []).some((c) => c.activo && c.configurado);

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aproba-50 text-aproba-700">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3M21 14v7h-7M17 21v-1" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800">VERI*FACTU</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {t("Cada factura que emites se registra en la AEAT al momento y sale con su QR tributario. Obligatorio para sociedades desde el 1 de enero de 2027 y para autónomos desde el 1 de julio de 2027.")}
          </p>
        </div>
        {estado && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${algunoActivo ? "bg-aproba-100 text-aproba-700" : "bg-slate-100 text-slate-500"}`}>
            {algunoActivo ? t("Activado") : t("No activado")}
          </span>
        )}
      </div>

      {estado === null ? (
        <p className="mt-3 text-xs text-slate-400">{t("Cargando…")}</p>
      ) : !estado.migracion ? (
        <p className="mt-3 text-xs text-amber-700">{t("Falta la migración de base de datos (supabase/verifactu.sql).")}</p>
      ) : estado.nifs.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">{t("Rellena antes el NIF de tu despacho en Datos de facturación: es el NIF que firma las facturas.")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {estado.nifs.map((n) => {
            const c = estado.configs.find((x) => x.nif === n.nif) ?? null;
            const abierto = editando === n.nif;
            return (
              <div key={n.nif} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{n.nombre} <span className="font-mono text-xs font-normal text-slate-500">{n.nif}</span></p>
                    <p className="text-[11px] text-slate-500">
                      {!c?.configurado ? t("Sin clave de Verifacti.")
                        : c.activo ? (c.entorno === "prod" ? t("Enviando a la AEAT (producción).") : t("Enviando al entorno de PRUEBAS de la AEAT (nada tiene validez fiscal)."))
                        : t("Pausado: las facturas no se registran.")}
                      {c?.ultimoError ? ` · ${c.ultimoError}` : ""}
                    </p>
                  </div>
                  {c?.configurado && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.activo ? (c.entorno === "prod" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700") : "bg-slate-100 text-slate-500"}`}>
                      {c.activo ? (c.entorno === "prod" ? t("Activo") : t("Pruebas")) : t("Pausado")}
                    </span>
                  )}
                  {c?.configurado && (
                    <button type="button" onClick={() => pausar(c)} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-50">
                      {c.activo ? t("Pausar") : t("Reanudar")}
                    </button>
                  )}
                  <button type="button" onClick={() => { setEditando(abierto ? null : n.nif); setClave(""); setError(null); }} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-50">
                    {c?.configurado ? t("Cambiar clave") : t("Pegar clave")}
                  </button>
                  {c?.configurado && (
                    <button type="button" onClick={() => quitar(c)} disabled={busy} className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:text-red-600 disabled:opacity-50">{t("Quitar")}</button>
                  )}
                </div>
                {abierto && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="password" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)}
                      placeholder={t("Clave de empresa de Verifacti para este NIF")}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs focus:border-aproba-400 focus:outline-none"
                    />
                    <button type="button" onClick={() => guardar(n.nif)} disabled={busy || clave.trim().length < 16} className="rounded-md bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
                      {busy ? t("Comprobando…") : t("Guardar y comprobar")}
                    </button>
                    <p className="w-full text-[11px] text-slate-500">{t("Se comprueba contra Verifacti que la clave responde y pertenece a este NIF. Una clave de pruebas envía al entorno de test de la AEAT.")}</p>
                  </div>
                )}
              </div>
            );
          })}

          {total > 0 && (
            <p className="text-xs text-slate-500">
              {t("Registros enviados")}: <span className="font-semibold text-slate-700">{total}</span>
              {pendientes > 0 && <> · {t("en cola")}: {pendientes}</>}
              {problemas > 0 && <> · <span className="font-semibold text-amber-700">{t("con incidencia")}: {problemas}</span> <span className="text-slate-400">({t("se ven en cada factura")})</span></>}
            </p>
          )}
          {estado.declaracion && (
            <p className="text-[11px] text-slate-500">
              <a href={estado.declaracion} target="_blank" rel="noreferrer" className="underline hover:text-slate-700">{t("Declaración responsable del sistema de facturación")}</a>
              {" "}· {t("la publica Verifacti, el sistema que genera y envía los registros.")}
            </p>
          )}
          {!algunoActivo && (
            <div className="rounded-lg border border-dashed border-aproba-200 bg-aproba-50/40 p-3">
              <p className="text-xs leading-relaxed text-slate-600">
                {t("¿Prefieres no tocar nada? Aproba da de alta tu NIF, te envía el modelo de representación para firmarlo y lo deja funcionando. Sin coste adicional durante 2026.")}
              </p>
              {solicitado ? (
                <p className="mt-2 text-xs font-semibold text-aproba-700">{t("Solicitud enviada: te escribimos en 1-2 días laborables.")}</p>
              ) : (
                <button type="button" onClick={solicitar} disabled={busy} className="mt-2 rounded-md border border-aproba-300 bg-white px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50 disabled:opacity-50">
                  {t("Quiero activarlo")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
