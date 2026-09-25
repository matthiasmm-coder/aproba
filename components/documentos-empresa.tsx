"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { DOC_LABEL } from "@/lib/tramites";
import { TIPOS_DOC_EMPRESA, agruparDocs, filtrarDocs, type DocEmpresaItem, type GrupoDocEmpresa } from "@/lib/documentos-empresa";

// DOCUMENTOS DE LA EMPRESA (25/09/2026, petición de Luis): todo lo que se presentó, en la
// ficha de la empresa y a un clic — los de sus expedientes y sus trabajadores (pasaportes,
// contratos, hojas de encargo, mandatos…) aparecen solos; los de la empresa y los antiguos
// se suben aquí. Búsqueda al instante, vista previa en el navegador y ZIP de todo.

const TIPOS_TRABAJADOR = Object.values(DOC_LABEL);
type Filtro = "todos" | GrupoDocEmpresa;

function IconoDoc({ mime }: { mime: string | null }) {
  const esImagen = (mime ?? "").startsWith("image/");
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${esImagen ? "bg-sky-50 text-sky-600" : "bg-red-50 text-red-500"}`} aria-hidden>
      {esImagen
        ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
        : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>}
    </span>
  );
}

const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" }) : "");

function FilaDoc({ d, onBorrar, borrando }: { d: DocEmpresaItem; onBorrar: (d: DocEmpresaItem) => void; borrando: boolean }) {
  const t = useT();
  return (
    <div className="group flex items-center gap-3 border-t border-slate-50 px-5 py-2.5 transition hover:bg-cream-50">
      <IconoDoc mime={d.mimeType} />
      <a href={`${d.href}?ver=1`} target="_blank" rel="noreferrer" className="min-w-0 flex-1" title={t("Abrir en una pestaña")}>
        <span className="block truncate text-sm font-medium text-slate-800">
          {t(d.label)}{d.grupo === "ENCARGO" && d.trabajador && <span className="font-normal text-slate-500"> · {d.trabajador}</span>}
        </span>
        <span className="block truncate text-xs text-slate-400">{[d.nombreArchivo, fechaCorta(d.fecha)].filter(Boolean).join(" · ")}</span>
      </a>
      {d.expedienteRef && d.expedienteId && (
        <Link href={`/app/expedientes/${d.expedienteId}`} className="hidden shrink-0 font-mono text-[11px] text-slate-400 hover:text-aproba-700 hover:underline sm:inline">{d.expedienteRef}</Link>
      )}
      {d.estado === "VALIDADO" && <span className="shrink-0 rounded-full bg-aproba-50 px-2 py-0.5 text-[11px] font-semibold text-aproba-700">{t("Validado")}</span>}
      {d.estado === "RECHAZADO" && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">{t("Rechazado")}</span>}
      <a href={d.href} download aria-label={t("Descargar")} title={t("Descargar")} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
      </a>
      {d.borrable && (
        <button type="button" onClick={() => onBorrar(d)} disabled={borrando} aria-label={t("Eliminar")} title={t("Eliminar")}
          className="shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
        </button>
      )}
    </div>
  );
}

function Grupo({ titulo, n, abierto, onToggle, children }: { titulo: string; n: number; abierto: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100">
      <button type="button" onClick={onToggle} aria-expanded={abierto} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition hover:bg-cream-50/60">
        <svg className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform ${abierto ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{titulo}</span>
        <span className="shrink-0 text-xs tabular-nums text-slate-400">{n}</span>
      </button>
      {abierto && children}
    </div>
  );
}

export function DocumentosEmpresa({ empresaId, trabajadores, docs, subidaDisponible }: {
  empresaId: string;
  trabajadores: { id: string; nombre: string }[];
  docs: DocEmpresaItem[];
  subidaDisponible: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const [subiendoAbierto, setSubiendoAbierto] = useState(false);
  const [destino, setDestino] = useState("empresa");
  const [tipo, setTipo] = useState(TIPOS_DOC_EMPRESA[0]);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const visibles = useMemo(() => filtrarDocs(docs, q).filter((d) => filtro === "todos" || d.grupo === filtro), [docs, q, filtro]);
  const g = useMemo(() => agruparDocs(visibles), [visibles]);
  const cuenta = useMemo(() => {
    const base = filtrarDocs(docs, q);
    return { todos: base.length, ENCARGO: base.filter((d) => d.grupo === "ENCARGO").length, EMPRESA: base.filter((d) => d.grupo === "EMPRESA").length, TRABAJADOR: base.filter((d) => d.grupo === "TRABAJADOR").length };
  }, [docs, q]);
  // Buscando, todo abierto: el resultado no puede quedar escondido en un grupo plegado.
  const abierto = (k: string) => Boolean(q.trim()) || !cerrados.has(k);
  const toggle = (k: string) => setCerrados((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const tipos = destino === "empresa" ? TIPOS_DOC_EMPRESA : TIPOS_TRABAJADOR;

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true); setError(null); setAviso(null);
    try {
      const fd = new FormData();
      fd.set("tipo", tipo);
      fd.set("destino", destino);
      for (const f of Array.from(files).slice(0, 10)) fd.append("file", f);
      const res = await fetch(`/api/empresas/${empresaId}/documentos`, { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { subidos?: number; errores?: string[]; error?: string };
      if (!res.ok && !j.subidos) throw new Error(j.error ?? j.errores?.join(" ") ?? t("No se pudo subir el documento."));
      setAviso(t("{n} documento(s) subido(s).").replace("{n}", String(j.subidos ?? 0)) + (j.errores?.length ? ` ${j.errores.join(" ")}` : ""));
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(d: DocEmpresaItem) {
    if (!(await confirmar({ titulo: t("¿Eliminar este documento?"), mensaje: `${t(d.label)}${d.nombreArchivo ? ` · ${d.nombreArchivo}` : ""}`, confirmarLabel: t("Eliminar"), peligro: true }))) return;
    setBorrando(d.id); setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/documentos/${d.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t("No se pudo eliminar."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrando(null);
    }
  }

  const chip = (k: Filtro, label: string, n: number) => (
    <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${filtro === k ? "bg-aproba-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
      {label}<span className={`tabular-nums ${filtro === k ? "text-white/80" : "text-slate-400"}`}>{n}</span>
    </button>
  );
  const lista = (items: DocEmpresaItem[]) => items.map((d) => <FilaDoc key={`${d.origen}:${d.id}`} d={d} onBorrar={borrar} borrando={borrando === d.id} />);

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Documentos")} ({docs.length})</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("Los de sus expedientes y sus trabajadores aparecen solos. Sube aquí los de la empresa y los antiguos.")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {docs.length > 0 && (
            <a href={`/api/empresas/${empresaId}/documentos/zip`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400">
              <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              {t("Descargar todo (ZIP)")}
            </a>
          )}
          <button type="button" onClick={() => setSubiendoAbierto((v) => !v)} aria-expanded={subiendoAbierto}
            className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">
            {t("+ Subir documentos")}
          </button>
        </div>
      </div>

      {subiendoAbierto && (
        <div className="mx-5 mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">{t("¿De quién es?")}
              <select value={destino} onChange={(e) => { setDestino(e.target.value); setTipo(e.target.value === "empresa" ? TIPOS_DOC_EMPRESA[0] : TIPOS_TRABAJADOR[0]); }}
                className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] text-slate-700 outline-none focus:border-aproba-600 sm:text-sm">
                <option value="empresa">{t("La empresa")}</option>
                {trabajadores.map((w) => <option key={w.id} value={w.id}>{w.nombre}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">{t("Tipo de documento")}
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] text-slate-700 outline-none focus:border-aproba-600 sm:text-sm">
                {tipos.map((x) => <option key={x} value={x}>{t(x)}</option>)}
              </select>
            </label>
          </div>
          {destino === "empresa" && !subidaDisponible ? (
            <p className="mt-2 text-xs text-amber-700">{t("Falta la migración: ejecuta supabase/documento-empresa.sql.")}</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" disabled={subiendo}
                onChange={(e) => void subir(e.target.files)} className="min-w-0 max-w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-aproba-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
              <span className="text-[11px] text-slate-400">{subiendo ? t("Subiendo…") : t("PDF o foto, hasta 10 a la vez (8 MB cada uno).")}</span>
            </div>
          )}
        </div>
      )}
      {aviso && <p className="mx-5 mt-2 rounded-lg bg-aproba-50 px-3 py-2 text-xs text-aproba-700">{aviso}</p>}
      {error && <p role="alert" className="mx-5 mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {docs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-3">
          <div className="relative min-w-0 flex-1 basis-56">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar documento, trabajador o expediente…")}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-[16px] outline-none focus:border-aproba-600 sm:text-sm" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chip("todos", t("Todos"), cuenta.todos)}
            {chip("ENCARGO", t("Encargo y mandatos"), cuenta.ENCARGO)}
            {chip("EMPRESA", t("Empresa"), cuenta.EMPRESA)}
            {chip("TRABAJADOR", t("Trabajadores"), cuenta.TRABAJADOR)}
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <p className="border-t border-slate-100 px-5 py-5 text-sm text-slate-400">{t("Todavía no hay documentos: los de sus expedientes aparecerán aquí solos, y los antiguos puedes subirlos ahora.")}</p>
      ) : visibles.length === 0 ? (
        <p className="border-t border-slate-100 px-5 py-5 text-sm text-slate-400">{t("Ningún documento coincide con la búsqueda.")}</p>
      ) : (
        <div className="pb-1">
          {g.encargo.length > 0 && <Grupo titulo={t("Hojas de encargo y mandatos")} n={g.encargo.length} abierto={abierto("encargo")} onToggle={() => toggle("encargo")}>{lista(g.encargo)}</Grupo>}
          {g.empresa.length > 0 && <Grupo titulo={t("De la empresa")} n={g.empresa.length} abierto={abierto("empresa")} onToggle={() => toggle("empresa")}>{lista(g.empresa)}</Grupo>}
          {g.trabajadores.map((w) => (
            <Grupo key={w.id} titulo={w.nombre} n={w.docs.length} abierto={abierto(`t:${w.id}`)} onToggle={() => toggle(`t:${w.id}`)}>{lista(w.docs)}</Grupo>
          ))}
        </div>
      )}
    </section>
  );
}
