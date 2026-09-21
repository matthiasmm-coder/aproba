"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { TelefonoInput } from "@/components/telefono-input";
import { confirmar } from "@/components/confirm-dialog";
import type { TrabajadorExpediente } from "@/lib/trabajadores";
import { fmtFechaCorta } from "@/lib/tramites";
import { copiarTexto } from "@/lib/copiar";

// TRABAJADORES de un expediente DE EMPRESA (Luis, 21/09/2026): quiénes van en este lote,
// añadir uno (existente de la empresa o nuevo), quitarlo si no dejó rastro, y marcar SU
// «presentado» (los trabajadores de un mismo lote se presentan en fechas distintas).
// Cada alta consume una unidad de la cuota mensual, como un expediente.

type Candidato = { id: string; nombre: string };

export function TrabajadoresExpediente({ expedienteId, trabajadores, candidatos, despachoEncargo }: {
  expedienteId: string;
  trabajadores: TrabajadorExpediente[];
  candidatos: Candidato[]; // trabajadores de la empresa que aún no están en el lote
  despachoEncargo: boolean; // hoja/mandato activos en Ajustes → enlace al mandato de cada uno
}) {
  const t = useT();
  const router = useRouter();
  const [modo, setModo] = useState<"cerrado" | "existente" | "nuevo">("cerrado");
  const [existente, setExistente] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", apellidos: "", email: "", telefono: "" });
  const [ocupado, setOcupado] = useState<string | null>(null); // id o "alta"
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  // ENLACE INDIVIDUAL (lote 3): /t/<token> abre SOLO lo suyo — sus documentos y su mandato.
  // Copiar o abrir WhatsApp deja constancia (enlaceEnviadoAt): la sección dice quién lo
  // tiene y quién no, y no se vuelve a pedir lo ya enviado.
  const origen = typeof window !== "undefined" ? window.location.origin : "https://aproba-software.com";
  const enlaceDe = (tr: TrabajadorExpediente) => (tr.token ? `${origen}/t/${tr.token}` : null);
  async function marcarEnviado(tr: TrabajadorExpediente) {
    if (tr.enlaceEnviadoAt) return;
    await fetch(`/api/expedientes/${expedienteId}/trabajadores/${tr.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enlaceEnviado: true }) }).catch(() => {});
    router.refresh();
  }
  async function copiarEnlace(tr: TrabajadorExpediente) {
    const url = enlaceDe(tr); if (!url) return;
    const ok = await copiarTexto(url);
    setCopiado(ok ? tr.id : null);
    if (ok) { setTimeout(() => setCopiado(null), 2000); void marcarEnviado(tr); }
    else setError(t("No se pudo copiar. Selecciona el enlace y cópialo a mano:") + " " + url);
  }
  function whatsappDe(tr: TrabajadorExpediente): string | null {
    const url = enlaceDe(tr); if (!url) return null;
    const msg = t("Hola {nombre}, soy de {gestoria}. Para tu trámite, entra aquí, sube tus documentos y firma tu mandato: {url}")
      .replace("{nombre}", tr.nombre.split(" ")[0]).replace("{gestoria}", t("tu gestoría")).replace("{url}", url);
    const tel = (tr.telefono ?? "").replace(/\D/g, "");
    return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }
  const sinEnlace = trabajadores.filter((x) => !x.enlaceEnviadoAt).length;

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm";

  async function llamar(url: string, init: RequestInit, fallo: string): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? fallo);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo);
      return false;
    }
  }

  async function anadir() {
    if (ocupado) return;
    const body = modo === "existente" ? { clienteId: existente } : { nuevo };
    if (modo === "existente" && !existente) { setError(t("Elige un trabajador.")); return; }
    if (modo === "nuevo" && !nuevo.nombre.trim()) { setError(t("El nombre del trabajador es obligatorio.")); return; }
    setOcupado("alta");
    const ok = await llamar(`/api/expedientes/${expedienteId}/trabajadores`, { method: "POST", body: JSON.stringify(body) }, t("No se pudo añadir el trabajador."));
    setOcupado(null);
    if (ok) { setModo("cerrado"); setExistente(""); setNuevo({ nombre: "", apellidos: "", email: "", telefono: "" }); }
  }

  async function quitar(tr: TrabajadorExpediente) {
    if (ocupado) return;
    if (!(await confirmar({
      titulo: t("Quitar del expediente"),
      mensaje: t("{nombre} dejará de estar en este expediente. Su ficha se conserva en Clientes.").replace("{nombre}", tr.nombre),
      confirmarLabel: t("Quitar"),
      peligro: true,
    }))) return;
    setOcupado(tr.id);
    await llamar(`/api/expedientes/${expedienteId}/trabajadores/${tr.id}`, { method: "DELETE" }, t("No se pudo quitar el trabajador."));
    setOcupado(null);
  }

  async function presentado(tr: TrabajadorExpediente, valor: boolean) {
    if (ocupado) return;
    setOcupado(tr.id);
    await llamar(`/api/expedientes/${expedienteId}/trabajadores/${tr.id}`, { method: "PATCH", body: JSON.stringify({ presentado: valor }) }, t("No se pudo guardar."));
    setOcupado(null);
  }

  const nPresentados = trabajadores.filter((x) => x.presentadoAt).length;

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {t("Trabajadores de este expediente")} ({trabajadores.length})
          {trabajadores.length > 0 && <span className="ml-2 normal-case tracking-normal text-slate-400">· {nPresentados}/{trabajadores.length} {t("presentados")}</span>}
        </p>
        {modo === "cerrado" && (
          <div className="flex gap-2">
            {candidatos.length > 0 && (
              <button type="button" onClick={() => setModo("existente")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-aproba-300 hover:text-aproba-700">
                {t("Añadir uno de la empresa")}
              </button>
            )}
            <button type="button" onClick={() => setModo("nuevo")} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">
              + {t("Trabajador nuevo")}
            </button>
          </div>
        )}
      </div>

      {trabajadores.length > 0 && sinEnlace > 0 && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {sinEnlace === 1
            ? t("Un trabajador aún no tiene su enlace: envíaselo para que suba sus documentos y firme su mandato.")
            : t("{n} trabajadores aún no tienen su enlace: envíaselo para que suban sus documentos y firmen su mandato.").replace("{n}", String(sinEnlace))}
        </p>
      )}
      {trabajadores.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t("Todavía sin trabajadores. Añádelos aquí; cada uno tendrá sus documentos, sus formularios y su mandato.")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-50">
          {trabajadores.map((tr) => (
            <li key={tr.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Link href={`/app/clientes/${tr.id}`} className="text-sm font-medium text-slate-800 hover:underline">{tr.nombre}</Link>
              <span className="text-xs text-slate-400">{[tr.nacionalidad, tr.email, tr.telefono].filter(Boolean).join(" · ")}</span>
              <span className="ml-auto flex items-center gap-3">
                {tr.token && (
                  <>
                    <button type="button" onClick={() => void copiarEnlace(tr)} className={`text-xs font-medium underline underline-offset-2 ${copiado === tr.id ? "text-aproba-700" : tr.enlaceEnviadoAt ? "text-slate-500 hover:text-slate-800" : "text-aproba-700 hover:text-aproba-600"}`} title={enlaceDe(tr) ?? ""}>
                      {copiado === tr.id ? t("Copiado ✓") : tr.enlaceEnviadoAt ? t("copiar su enlace") : t("copiar su enlace (sin enviar)")}
                    </button>
                    <a href={whatsappDe(tr) ?? "#"} target="_blank" rel="noreferrer" onClick={() => void marcarEnviado(tr)} className="text-xs font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">WhatsApp</a>
                  </>
                )}
                {despachoEncargo && (
                  <a href={`/api/expedientes/${expedienteId}/encargo?doc=mandato&clienteId=${tr.id}`} className="text-xs font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">
                    {t("mandato (PDF)")}
                  </a>
                )}
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={Boolean(tr.presentadoAt)} disabled={ocupado === tr.id} onChange={(e) => void presentado(tr, e.target.checked)} className="h-3.5 w-3.5 accent-aproba-600" />
                  {tr.presentadoAt ? `${t("presentado")} ${fmtFechaCorta(tr.presentadoAt) ?? ""}` : t("presentado")}
                </label>
                <button type="button" onClick={() => void quitar(tr)} disabled={ocupado === tr.id} className="text-xs text-slate-400 transition hover:text-red-600 disabled:opacity-50" title={t("Quitar del expediente")}>
                  {t("Quitar")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {modo === "existente" && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-cream-50/60 p-3">
          <label className="text-xs font-medium text-slate-600">{t("Trabajador de la empresa")}</label>
          <select value={existente} onChange={(e) => setExistente(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-aproba-600">
            <option value="">{t("Elige…")}</option>
            {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void anadir()} disabled={ocupado === "alta"} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">{ocupado === "alta" ? t("Añadiendo…") : t("Añadir al expediente")}</button>
            <button type="button" onClick={() => { setModo("cerrado"); setError(null); }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">{t("Cancelar")}</button>
          </div>
        </div>
      )}

      {modo === "nuevo" && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-cream-50/60 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Nombre *")}</label>
              <input value={nuevo.nombre} onChange={(e) => setNuevo((c) => ({ ...c, nombre: e.target.value }))} className={input} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Apellidos")}</label>
              <input value={nuevo.apellidos} onChange={(e) => setNuevo((c) => ({ ...c, apellidos: e.target.value }))} className={input} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Email")}</label>
              <input type="email" value={nuevo.email} onChange={(e) => setNuevo((c) => ({ ...c, email: e.target.value }))} className={input} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t("Teléfono (WhatsApp)")}</label>
              <div className="mt-1">
                <TelefonoInput value={nuevo.telefono} onChange={(v) => setNuevo((c) => ({ ...c, telefono: v }))} className={input.replace("mt-1 ", "")} labelPrefijo={t("Prefijo de país")} />
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("El resto de su ficha se completa después, a mano o con la lectura de sus documentos.")}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void anadir()} disabled={ocupado === "alta"} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">{ocupado === "alta" ? t("Añadiendo…") : t("Añadir al expediente")}</button>
            <button type="button" onClick={() => { setModo("cerrado"); setError(null); }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">{t("Cancelar")}</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
