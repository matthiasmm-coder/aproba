"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { copiarTexto } from "@/lib/copiar";
import { faltaParaConsultar, csvTabla, ESTADO_TRAMITE, resolucionDe, type FilaTabla } from "@/lib/expedientes-tabla";
import { NumeroOficial } from "@/components/numero-oficial";

// VISTA TABLA (PROTOTIPO LOCAL, 23/09/2026 — petición de Jennifer).
// Réplica de su Excel: mismas columnas, mismo orden, bandas por año. Las columnas que
// Aproba aún no guarda van marcadas con un punto ámbar y salen vacías a propósito: el
// prototipo enseña lo que HAY hoy y lo que habría que añadir, sin inventar datos.
//
// «Consultar»: la web oficial (infoext2) pide NIE o nº de expediente, fecha de
// presentación y año de nacimiento, y exige un captcha. Aproba no puede ni debe
// consultarla sola: aquí prepara los tres datos y abre la consulta; el captcha lo
// valida el gestor.

export type { FilaTabla } from "@/lib/expedientes-tabla";

const INFOEXT = "https://infoext2.delegaciondelgobierno.gob.es/infoext2/consulta.html";


const fechaCorta = (iso: string) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

function Nueva({ t }: { t: (k: string) => string }) {
  return <span title={t("Columna nueva: Aproba todavía no guarda este dato")} className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-amber-400 align-middle" />;
}

function Vacia({ t }: { t: (k: string) => string }) {
  return <span title={t("Columna nueva: Aproba todavía no guarda este dato")} className="inline-block h-4 w-14 rounded border border-dashed border-amber-300 bg-amber-50/40" />;
}

function Consultar({ f, t }: { f: FilaTabla; t: (k: string) => string }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const anioNac = f.fechaNacimiento.slice(0, 4);
  const faltan = faltaParaConsultar(f).map((x) => t(x));
  const copiar = async (etiqueta: string, valor: string) => {
    if (await copiarTexto(valor)) { setCopiado(etiqueta); window.setTimeout(() => setCopiado(null), 1500); }
  };
  if (faltan.length) {
    return <span title={`${t("Falta para consultar:")} ${faltan.join(", ")}`} className="cursor-help text-[11px] text-slate-300">{t("Consultar")}</span>;
  }
  return (
    <span className="relative">
      <button type="button" onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v); }}
        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-aproba-700 transition hover:border-aproba-300">
        {t("Consultar")}
      </button>
      {abierto && (
        <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-7 z-20 w-64 whitespace-normal rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Estado en Extranjería")}</p>
          {([[t("Nº expediente"), f.numeroOficial], [t("NIE"), f.nie], [t("Fecha de presentación"), fechaCorta(f.fechaPresentacion)], [t("Año de nacimiento"), anioNac]] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
            <button key={k} type="button" onClick={() => copiar(k, v)} className="mt-1.5 flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-slate-50">
              <span className="text-slate-500">{k}</span>
              <span className="font-mono text-slate-900">{copiado === k ? `✓ ${t("copiado")}` : v}</span>
            </button>
          ))}
          <a href={INFOEXT} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-lg bg-aproba-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-aproba-700">
            {t("Abrir la consulta oficial")} ↗
          </a>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{t("La web oficial pide un captcha: lo validas tú. Aproba no puede consultarla por su cuenta.")}</p>
        </div>
      )}
    </span>
  );
}

export function ExpedientesTabla({ filas, conBuscador = true, onNumeroOficial, nombreExport = "expedientes" }: { filas: FilaTabla[]; conBuscador?: boolean; onNumeroOficial?: (id: string, numero: string) => void; nombreExport?: string }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");

  // Bandas por año, la más reciente arriba; dentro, lo último presentado primero.
  const grupos = useMemo(() => {
    const s = q.trim().toLowerCase();
    const vis = s ? filas.filter((f) => [f.nombre, f.nie, f.pasaporte, f.referencia, f.numeroOficial, f.tramitadoPor].some((x) => x.toLowerCase().includes(s))) : filas;
    const por = new Map<string, FilaTabla[]>();
    for (const f of vis) { const k = f.anio || "—"; por.set(k, [...(por.get(k) ?? []), f]); }
    return [...por.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([anio, lista]) => ({ anio, lista: lista.sort((x, y) => (y.fechaPresentacion || "").localeCompare(x.fechaPresentacion || "")) }));
  }, [filas, q]);

  const visibles = useMemo(() => grupos.flatMap((g) => g.lista), [grupos]);
  // Se exporta LO QUE SE VE, en el orden de la pantalla (bandas por año incluidas).
  function exportar() {
    const hoy = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([csvTabla(visibles)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `${nombreExport}-${hoy}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const th = "whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide";
  const td = "whitespace-nowrap px-2.5 py-2 text-xs text-slate-700";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {conBuscador ? (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar por nombre, NIE o referencia…")}
            className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600" />
        ) : <span />}
        <div className="flex items-center gap-3">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Nueva t={t} /> {t("columnas que Aproba todavía no guarda")}</p>
          <button type="button" onClick={exportar} disabled={visibles.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {t("Exportar a Excel")}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className={th}>{t("Nombre completo")}</th>
              <th className={th}>{t("NIE")}</th>
              <th className={th} title={t("Nº de expediente de Extranjería")}>{t("Nº expediente")}</th>
              <th className={th}>{t("Año")}</th>
              <th className={th} title={t("Fecha de nacimiento")}>{t("F. nacimiento")}</th>
              <th className={th}>{t("Estado de trámite")}</th>
              <th className={th} title={t("Fecha de presentación")}>{t("F. presentación")}</th>
              <th className={th}>{t("Tramitado por")}</th>
              <th className={th}>{t("Colaborador")}<Nueva t={t} /></th>
              <th className={th}>{t("Resolución")}</th>
              <th className={th}>{t("Tasa pagada")}<Nueva t={t} /></th>
              <th className={th}><span className="sr-only">{t("Consultar")}</span></th>
            </tr>
          </thead>
          <tbody>
            {grupos.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-slate-400">{t("Ningún expediente coincide.")}</td></tr>
            )}
            {grupos.map((g) => (
              <FilasAnio key={g.anio} anio={g.anio} lista={g.lista} t={t} td={td} onAbrir={(id) => router.push(`/app/expedientes/${id}`)} onNumeroOficial={onNumeroOficial} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilasAnio({ anio, lista, t, td, onAbrir, onNumeroOficial }: { anio: string; lista: FilaTabla[]; t: (k: string) => string; td: string; onAbrir: (id: string) => void; onNumeroOficial?: (id: string, numero: string) => void }) {
  return (
    <>
      <tr className="bg-slate-100">
        <td colSpan={12} className="px-2.5 py-1.5 text-center text-[11px] font-bold tracking-wide text-slate-600">
          {anio} <span className="font-normal text-slate-400">· {lista.length}</span>
        </td>
      </tr>
      {lista.map((f) => (
        <tr key={f.id} onClick={() => onAbrir(f.id)} className={`cursor-pointer border-t border-slate-100 transition hover:bg-aproba-50/40 ${f.archivado ? "text-slate-400" : ""}`}>
          <td className={`${td} font-medium text-slate-900`}>
            {f.nombre || "—"}
            <span className="block font-mono text-[10px] font-normal text-slate-400">{f.referencia}</span>
          </td>
          <td className={`${td} font-mono`}>{f.nie || <span className="text-slate-300">—</span>}</td>
          <td className={td}><NumeroOficial key={f.id} expedienteId={f.id} inicial={f.numeroOficial} variante="celda" onGuardado={(n) => onNumeroOficial?.(f.id, n)} /></td>
          <td className={td}>{f.anio}</td>
          <td className={td}>{fechaCorta(f.fechaNacimiento) || <span className="text-slate-300">—</span>}</td>
          <td className={td}>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.estado === "EN_PREPARACION" ? "bg-slate-100 text-slate-600" : f.estado === "PRESENTADO" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
              {t(ESTADO_TRAMITE[f.estado])}
            </span>
          </td>
          <td className={td}>{fechaCorta(f.fechaPresentacion) || <span className="text-slate-300">—</span>}</td>
          <td className={td}>{f.tramitadoPor || <span className="text-slate-300">—</span>}</td>
          <td className={td}><Vacia t={t} /></td>
          <td className={td}>
            {resolucionDe(f.estado)
              ? <span className={`font-semibold ${f.estado === "RECHAZADO" ? "text-red-600" : "text-aproba-700"}`}>{t(resolucionDe(f.estado))}</span>
              : <span className="text-slate-300">—</span>}
          </td>
          <td className={td}>
            {f.tasaGenerada
              ? <span title={t("Aproba sabe que la tasa está generada, no si está pagada")} className="text-slate-500">{t("generada")} · <Vacia t={t} /></span>
              : <Vacia t={t} />}
          </td>
          <td className={`${td} text-right`}><Consultar f={f} t={t} /></td>
        </tr>
      ))}
    </>
  );
}
