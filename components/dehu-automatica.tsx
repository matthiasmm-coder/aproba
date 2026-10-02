"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { URL_DEHU } from "@/lib/notificaciones-dehu";
import { copiarTexto } from "@/lib/copiar";

// DEHú AUTOMÁTICA (29/09/2026) — la tarjeta de arriba de la pestaña DEHú. El despacho
// conecta su certificado (el mismo que dio de alta como «Gran Destinatario» en la DEHú) y
// Aproba consulta su DEHú solo: lo pendiente aparece en la bandeja y en la campana, lo que
// abran en la DEHú llega en PDF, y cada notificación se puede ABRIR desde Aproba (con
// confirmación: abrirla es darse por notificado). Ver lib/dehu/sincronizar.ts.
// No se enseña hasta que el servidor está listo (clave de la caja fuerte + migración).

type Estado = {
  disponible: boolean; migracion: boolean; conectada: boolean; puedeGestionar: boolean;
  estado?: "ACTIVA" | "ERROR" | "PAUSADA"; entorno?: "PRUEBAS" | "PRODUCCION";
  titularNombre?: string | null; titularNif?: string | null; receptorNombre?: string | null;
  certTipo?: string | null; certCaducaAt?: string | null;
  ultimaConsultaAt?: string | null; ultimoExitoAt?: string | null; ultimoError?: string | null;
  pendienteAlta?: boolean; partePublica?: string | null;
};

const fechaHora = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
};
const fecha = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
};

export function DehuAutomatica() {
  const t = useT();
  const router = useRouter();
  const [e, setE] = useState<Estado | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [autorizo, setAutorizo] = useState(false);
  const [pruebas, setPruebas] = useState(false);
  const [verPruebas, setVerPruebas] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pemRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // El entorno de pruebas de la DEHú solo se ofrece con ?entorno=pruebas (alta en pruebas).
    try { setVerPruebas(new URLSearchParams(window.location.search).get("entorno") === "pruebas"); } catch { /* sin URL */ }
    fetch("/api/dehu/automatico", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => setE(d as Estado | null)).catch(() => setE(null));
  }, []);

  if (!e || !e.disponible || !e.migracion) return null;

  async function conectar() {
    if (!archivo) { setError(t("Elige el archivo del certificado (.p12 o .pfx).")); return; }
    if (!clave) { setError(t("Escribe la contraseña del certificado.")); return; }
    if (!autorizo) { setError(t("Marca la autorización para continuar.")); return; }
    setOcupado("conectar"); setError(null); setAviso(null);
    try {
      const fd = new FormData();
      fd.append("certificado", archivo);
      fd.append("clave", clave);
      fd.append("entorno", pruebas ? "PRUEBAS" : "PRODUCCION");
      const r = await fetch("/api/dehu/automatico", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? t("No se pudo conectar la DEHú."));
      setE(d as Estado);
      setAbierto(false); setClave(""); setArchivo(null); setAutorizo(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : t("No se pudo conectar la DEHú.")); }
    finally { setOcupado(null); setClave(""); }
  }

  async function consultar() {
    setOcupado("consultar"); setError(null); setAviso(null);
    try {
      const r = await fetch("/api/dehu/automatico/consultar", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (d.estado) setE((prev) => ({ ...(prev as Estado), ...(d.estado as Estado) }));
      if (!r.ok) throw new Error(d.resultado?.error ?? d.error ?? t("No se pudo consultar la DEHú."));
      if (d.estado?.pendienteAlta) { setAviso(t("La DEHú aún no acepta el certificado. Si ya firmaste la declaración, vuelve a comprobarlo en unos minutos.")); return; }
      const n = Number(d.resultado?.nuevas ?? 0), docs = Number(d.resultado?.importadas ?? 0);
      setAviso(n || docs
        ? [n ? (n === 1 ? t("1 notificación nueva") : t("{n} notificaciones nuevas").replace("{n}", String(n))) : "",
          docs ? (docs === 1 ? t("1 documento traído") : t("{n} documentos traídos").replace("{n}", String(docs))) : ""].filter(Boolean).join(" · ")
        : t("Nada nuevo en tu DEHú."));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : t("No se pudo consultar la DEHú.")); }
    finally { setOcupado(null); }
  }

  async function copiarParte() {
    if (!e?.partePublica) return;
    if (await copiarTexto(e.partePublica)) { setCopiado(true); window.setTimeout(() => setCopiado(false), 1800); }
    else { pemRef.current?.select(); setAviso(t("Selecciónalo y cópialo con Ctrl+C.")); }
  }

  async function desconectar() {
    if (!(await confirmar({ titulo: t("Desconectar la DEHú automática"), mensaje: t("Aproba borrará tu certificado y dejará de consultar tu DEHú. Las notificaciones ya recibidas se quedan."), confirmarLabel: t("Desconectar"), peligro: true }))) return;
    setOcupado("desconectar"); setError(null);
    try {
      const r = await fetch("/api/dehu/automatico", { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? t("No se pudo desconectar."));
      setE(d as Estado);
    } catch (err) { setError(err instanceof Error ? err.message : t("No se pudo desconectar.")); }
    finally { setOcupado(null); }
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50";
  const btnPrim = `${btn} bg-aproba-600 text-white hover:bg-aproba-700`;
  const btnSec = `${btn} border border-slate-300 bg-white text-slate-700 hover:border-slate-400`;

  // Certificado guardado que la DEHú aún no acepta: falta su alta de «Gran Destinatario».
  // Aproba da hecha la parte pública (antes: exportar un .cer y abrirlo en el Bloc de notas).
  if (e.conectada && e.pendienteAlta) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          <p className="text-sm font-semibold text-slate-900">{t("DEHú automática")}</p>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t("Falta el alta en la DEHú")}</span>
          {e.entorno === "PRUEBAS" && <span className="rounded bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">{t("Entorno de pruebas")}</span>}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={consultar} disabled={ocupado !== null} className={btnSec}>{ocupado === "consultar" ? t("Comprobando con la DEHú…") : t("Comprobar ahora")}</button>
            {e.puedeGestionar && <button type="button" onClick={desconectar} disabled={ocupado !== null} className="text-xs font-semibold text-slate-500 transition hover:text-red-600 disabled:opacity-50">{t("Retirar el certificado")}</button>}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {t("Aproba ya tiene el certificado de")} <b className="font-semibold text-slate-800">{e.receptorNombre}</b>. {t("Falta darlo de alta en la DEHú como «Gran Destinatario»: en cuanto la DEHú lo acepte, Aproba se conecta solo.")}
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
          <li>
            {t("Entra en la DEHú con este mismo certificado (DNIe / Certificado electrónico).")}{" "}
            <a href={URL_DEHU} target="_blank" rel="noopener noreferrer" className="font-semibold text-aproba-700 hover:underline">dehu.redsara.es</a>
          </li>
          <li>{t("Pulsa tu nombre, arriba a la derecha, y abre «Configuración Gran Destinatario».")}</li>
          <li>
            {t("Rellena tus datos de contacto. En «Certificado», escribe Aproba como alias y pega este texto en «Parte pública»:")}
            {e.partePublica ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <textarea ref={pemRef} readOnly value={e.partePublica} rows={4} onFocus={(ev) => ev.currentTarget.select()} aria-label={t("Parte pública del certificado")}
                  className="block w-full resize-none bg-transparent px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700 outline-none" />
                <div className="flex justify-end border-t border-slate-100 px-2 py-1.5">
                  <button type="button" onClick={copiarParte} className={btnPrim}>{copiado ? t("Copiado") : t("Copiar el texto")}</button>
                </div>
              </div>
            ) : (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{t("No se puede leer el certificado guardado: retíralo y vuelve a subirlo.")}</p>
            )}
          </li>
          <li>{t("Pulsa «Guardar» y firma la declaración responsable con AutoFirma, con este mismo certificado.")}</li>
        </ol>
        {aviso && <p className="mt-3 text-xs font-semibold text-amber-800">{aviso}</p>}
        {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        <p className="mt-3 text-xs text-slate-400">{t("Aproba lo comprueba cada 20 minutos mientras alguien usa la app, y cada mañana. Hasta que la DEHú lo acepte no consulta nada.")}</p>
      </section>
    );
  }

  if (e.conectada) {
    const conError = e.estado === "ERROR" || Boolean(e.ultimoError);
    const diasCert = e.certCaducaAt ? Math.floor((new Date(e.certCaducaAt).getTime() - Date.now()) / 86_400_000) : null;
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${conError ? "bg-amber-500" : "bg-aproba-600"}`} aria-hidden />
          <p className="text-sm font-semibold text-slate-900">{t("DEHú automática")}</p>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${conError ? "bg-amber-100 text-amber-800" : "bg-aproba-50 text-aproba-700"}`}>{conError ? t("Con errores") : t("Conectada")}</span>
          {e.entorno === "PRUEBAS" && <span className="rounded bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">{t("Entorno de pruebas")}</span>}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={consultar} disabled={ocupado !== null} className={btnSec}>{ocupado === "consultar" ? t("Consultando…") : t("Consultar ahora")}</button>
            {e.puedeGestionar && <button type="button" onClick={desconectar} disabled={ocupado !== null} className="text-xs font-semibold text-slate-500 transition hover:text-red-600 disabled:opacity-50">{t("Desconectar")}</button>}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {t("Notificaciones de")} <b className="font-semibold text-slate-800">{e.titularNombre}</b>{e.titularNif ? ` (${e.titularNif})` : ""}
          {e.ultimoExitoAt ? ` · ${t("última consulta")} ${fechaHora(e.ultimoExitoAt)}` : ""}
        </p>
        <p className={`mt-0.5 text-xs ${diasCert !== null && diasCert < 30 ? "font-semibold text-amber-700" : "text-slate-400"}`}>
          {t("Certificado de")} {e.receptorNombre}{e.certCaducaAt ? ` · ${t("caduca el")} ${fecha(e.certCaducaAt)}` : ""}
          {diasCert !== null && diasCert < 30 ? ` — ${t("renuévalo y vuelve a conectarlo")}` : ""}
        </p>
        {e.ultimoError && <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{e.ultimoError}</p>}
        {aviso && <p className="mt-2 text-xs font-semibold text-aproba-700">{aviso}</p>}
        {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-slate-400">{t("Aproba mira tu DEHú cada 20 minutos mientras alguien usa la app, y cada mañana. Solo guarda lo de extranjería y nacionalidad, y nunca abre una notificación sin que lo pidas.")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-aproba-200 bg-aproba-50/40 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">{t("DEHú automática")}</p>
        <span className="rounded bg-aproba-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">{t("Nuevo")}</span>
        {e.puedeGestionar && !abierto && <button type="button" onClick={() => setAbierto(true)} className={`${btnPrim} ml-auto`}>{t("Conectar")}</button>}
      </div>
      <p className="mt-1 text-sm text-slate-600">{t("Aproba consulta tu DEHú por ti: cada notificación de extranjería aparece aquí y en la campana en cuanto llega, sin descargar ni reenviar nada. Tú decides cuándo abrirla.")}</p>
      {!e.puedeGestionar && <p className="mt-2 text-xs text-slate-500">{t("Pide a un administrador del despacho que la conecte.")}</p>}

      {abierto && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
            <li>{t("Sube aquí el certificado del despacho (.p12 o .pfx) con su contraseña: el del NIF al que llegan las notificaciones.")}</li>
            <li>{t("Si aún no está dado de alta en la DEHú como «Gran Destinatario», Aproba te dirá qué pegar allí y se conectará solo en cuanto la DEHú lo acepte.")}</li>
          </ol>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">{t("Certificado (.p12 o .pfx)")}
              <input ref={fileRef} type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(ev) => setArchivo(ev.target.files?.[0] ?? null)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] font-normal file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-sm sm:text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">{t("Contraseña del certificado")}
              <input type="password" value={clave} onChange={(ev) => setClave(ev.target.value)} autoComplete="off"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] font-normal outline-none focus:border-aproba-600 sm:text-sm" />
            </label>
          </div>
          <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
            <input type="checkbox" checked={autorizo} onChange={(ev) => setAutorizo(ev.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-aproba-600" />
            {t("Autorizo a Aproba a guardar este certificado cifrado y a usarlo solo para consultar la DEHú del despacho y abrir las notificaciones que un miembro pida. Puedo retirarlo cuando quiera.")}
          </label>
          {verPruebas && (
            <label className="flex items-center gap-2 text-xs text-violet-700">
              <input type="checkbox" checked={pruebas} onChange={(ev) => setPruebas(ev.target.checked)} className="h-3.5 w-3.5 accent-violet-600" />
              {t("Entorno de pruebas de la DEHú (alta «LEMA en pruebas»)")}
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={conectar} disabled={ocupado !== null} className={btnPrim}>{ocupado === "conectar" ? t("Comprobando con la DEHú…") : t("Conectar la DEHú")}</button>
            <button type="button" onClick={() => { setAbierto(false); setError(null); setClave(""); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">{t("Cancelar")}</button>
          </div>
          <p className="text-xs text-slate-400">{t("Consultar tus notificaciones no las abre: solo se abren cuando alguien pulsa «Abrir» en una de ellas y lo confirma.")}</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
