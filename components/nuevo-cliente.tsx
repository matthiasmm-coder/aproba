"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

// Création de clients existants du gestor : saisie manuelle d'une fiche complète,
// ou import CSV en masse (avec détection des doublons et des lignes invalides).
// Rien à voir avec « Nuevo expediente » : ici on alimente le fichier clients.

type Campos = {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  nacionalidad: string;
  numeroDocumento: string;
  idioma: string;
};

const VACIO: Campos = { nombre: "", apellidos: "", email: "", telefono: "", nacionalidad: "", numeroDocumento: "", idioma: "es" };

const IDIOMAS = [
  ["es", "Español"],
  ["ca", "Català"],
  ["en", "English"],
  ["fr", "Français"],
  ["ar", "العربية"],
  ["ro", "Română"],
  ["zh", "中文"],
] as const;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// ── Parsing CSV (séparateur ; ou , — guillemets gérés) ──────────────────────
function parseCSV(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // BOM Excel
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

// En-têtes reconnus (insensible aux accents/majuscules).
const CABECERAS: Record<keyof Omit<Campos, "idioma">, string[]> & { idioma: string[] } = {
  nombre: ["nombre", "name", "prenom"],
  apellidos: ["apellidos", "apellido", "surname", "nom"],
  email: ["email", "correo", "e-mail", "mail"],
  telefono: ["telefono", "tel", "movil", "phone", "telephone"],
  nacionalidad: ["nacionalidad", "pais", "country", "nationalite"],
  numeroDocumento: ["documento", "numerodocumento", "ndocumento", "nie", "pasaporte", "dni", "passport"],
  idioma: ["idioma", "lengua", "language", "langue"],
};

type Fila = Campos & { estado: "ok" | "duplicado" | "sin_nombre" };

export function NuevoCliente() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"manual" | "csv">("manual");

  // ── Manuel ──
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── CSV ──
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [nombreFichero, setNombreFichero] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ importados: number; duplicados: number; invalidos: number } | null>(null);

  async function contexto() {
    const supabase = createSupabaseBrowser();
    const { data: mem, error: e } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
    if (e || !mem) throw new Error(e?.message ?? "No se encontró tu despacho.");
    return { supabase, ws: mem.workspaceId as string };
  }

  function filaACliente(f: Campos, ws: string) {
    return {
      id: crypto.randomUUID(),
      workspaceId: ws,
      nombre: f.nombre.trim(),
      apellidos: f.apellidos.trim() || null,
      email: f.email.trim() || null,
      telefono: f.telefono.trim() || null,
      nacionalidad: f.nacionalidad.trim() || null,
      numeroDocumento: f.numeroDocumento.trim() || null,
      idioma: f.idioma || "es",
      updatedAt: new Date().toISOString(),
    };
  }

  // ── Création manuelle ──
  async function guardar(otro: boolean) {
    if (!campos.nombre.trim()) return setError("El nombre es obligatorio.");
    setGuardando(true);
    setError(null);
    try {
      const { supabase, ws } = await contexto();
      const { error: e } = await supabase.from("Cliente").insert(filaACliente(campos, ws));
      if (e) throw new Error(e.message);
      if (otro) {
        setCampos(VACIO);
        setToast(`✓ ${campos.nombre.trim()} añadido`);
        window.setTimeout(() => setToast(null), 2500);
      } else {
        router.push("/app/clientes");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  // ── Import CSV ──
  async function onFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNombreFichero(file.name);
    setResultado(null);
    setError(null);
    try {
      const rows = parseCSV(await file.text());
      if (rows.length < 2) throw new Error("El CSV está vacío (se espera una fila de cabeceras + datos).");

      // mapper les colonnes depuis la ligne d'en-têtes
      const headers = rows[0].map(norm);
      const idx: Partial<Record<keyof Campos, number>> = {};
      (Object.keys(CABECERAS) as (keyof Campos)[]).forEach((campo) => {
        const i = headers.findIndex((h) => CABECERAS[campo].includes(h.replace(/[^a-z]/g, "")));
        if (i >= 0) idx[campo] = i;
      });
      if (idx.nombre === undefined) throw new Error('No se encontró la columna "nombre". Descarga la plantilla para ver el formato.');

      // doublons : par rapport aux clients existants (email ou nombre+apellidos)
      const { supabase } = await contexto();
      const { data: existentes } = await supabase.from("Cliente").select("nombre, apellidos, email");
      const llaves = new Set<string>();
      (existentes ?? []).forEach((c) => {
        if (c.email) llaves.add("e:" + norm(c.email));
        llaves.add("n:" + norm(`${c.nombre} ${c.apellidos ?? ""}`));
      });

      const parsed: Fila[] = rows.slice(1).map((r) => {
        const get = (k: keyof Campos) => (idx[k] !== undefined ? (r[idx[k]!] ?? "").trim() : "");
        const f: Campos = {
          nombre: get("nombre"), apellidos: get("apellidos"), email: get("email"), telefono: get("telefono"),
          nacionalidad: get("nacionalidad"), numeroDocumento: get("numeroDocumento"), idioma: get("idioma") || "es",
        };
        let estado: Fila["estado"] = "ok";
        if (!f.nombre) estado = "sin_nombre";
        else if ((f.email && llaves.has("e:" + norm(f.email))) || llaves.has("n:" + norm(`${f.nombre} ${f.apellidos}`))) estado = "duplicado";
        else llaves.add("n:" + norm(`${f.nombre} ${f.apellidos}`)); // dédoublonner aussi à l'intérieur du fichier
        return { ...f, estado };
      });
      setFilas(parsed);
    } catch (err) {
      setFilas(null);
      setError(err instanceof Error ? err.message : "No se pudo leer el CSV.");
    }
  }

  async function importar() {
    if (!filas) return;
    const validas = filas.filter((f) => f.estado === "ok");
    if (!validas.length) return setError("No hay filas nuevas que importar.");
    setImportando(true);
    setError(null);
    try {
      const { supabase, ws } = await contexto();
      for (let i = 0; i < validas.length; i += 100) {
        const lote = validas.slice(i, i + 100).map((f) => filaACliente(f, ws));
        const { error: e } = await supabase.from("Cliente").insert(lote);
        if (e) throw new Error(e.message);
      }
      setResultado({
        importados: validas.length,
        duplicados: filas.filter((f) => f.estado === "duplicado").length,
        invalidos: filas.filter((f) => f.estado === "sin_nombre").length,
      });
      setFilas(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar.");
    } finally {
      setImportando(false);
    }
  }

  function descargarPlantilla() {
    const csv = "﻿nombre;apellidos;email;telefono;nacionalidad;documento;idioma\nJulia;Mendoza;julia@email.com;612345678;Colombia;AY0429317;es\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const input = "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";
  const nValidas = filas?.filter((f) => f.estado === "ok").length ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Clientes
      </Link>

      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">Nuevo cliente</h1>
      <p className="mt-1 text-slate-500">Añade un cliente que ya tienes, o importa todos de golpe desde un CSV.</p>

      {/* Onglets */}
      <div className="mt-6 inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        {([["manual", "Añadir manualmente"], ["csv", "Importar CSV"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setError(null); }} className={`rounded-md px-4 py-2 text-sm font-medium transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Manuel ── */}
      {tab === "manual" && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Nombre *</label>
              <input value={campos.nombre} onChange={(e) => setCampos((c) => ({ ...c, nombre: e.target.value }))} placeholder="Julia" className={input} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Apellidos</label>
              <input value={campos.apellidos} onChange={(e) => setCampos((c) => ({ ...c, apellidos: e.target.value }))} placeholder="Mendoza Restrepo" className={input} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input type="email" value={campos.email} onChange={(e) => setCampos((c) => ({ ...c, email: e.target.value }))} placeholder="julia@email.com" className={input} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Teléfono</label>
              <input value={campos.telefono} onChange={(e) => setCampos((c) => ({ ...c, telefono: e.target.value }))} placeholder="612 345 678" className={input} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Nacionalidad</label>
              <input value={campos.nacionalidad} onChange={(e) => setCampos((c) => ({ ...c, nacionalidad: e.target.value }))} placeholder="Colombia" className={input} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Nº documento (NIE / pasaporte)</label>
              <input value={campos.numeroDocumento} onChange={(e) => setCampos((c) => ({ ...c, numeroDocumento: e.target.value }))} placeholder="AY0429317" className={input} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Idioma de comunicación</label>
              <select value={campos.idioma} onChange={(e) => setCampos((c) => ({ ...c, idioma: e.target.value }))} className={`${input} bg-white`}>
                {IDIOMAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {toast && <p className="mt-4 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-700">{toast}</p>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-6 flex gap-3">
            <button onClick={() => guardar(false)} disabled={guardando} className="flex-1 rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
              {guardando ? "Guardando…" : "Guardar cliente"}
            </button>
            <button onClick={() => guardar(true)} disabled={guardando} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
              Guardar y añadir otro
            </button>
          </div>
        </div>
      )}

      {/* ── CSV ── */}
      {tab === "csv" && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
          {resultado ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-aproba-600">
                <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <p className="mt-4 text-lg font-bold text-slate-900">{resultado.importados} clientes importados</p>
              <p className="mt-1 text-sm text-slate-500">
                {resultado.duplicados > 0 && `${resultado.duplicados} duplicados omitidos`}
                {resultado.duplicados > 0 && resultado.invalidos > 0 && " · "}
                {resultado.invalidos > 0 && `${resultado.invalidos} filas sin nombre`}
                {resultado.duplicados === 0 && resultado.invalidos === 0 && "Sin incidencias."}
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link href="/app/clientes" className="rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">Ver clientes →</Link>
                <button onClick={() => setResultado(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Importar otro CSV</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Columnas reconocidas: <span className="font-mono text-xs">nombre*, apellidos, email, telefono, nacionalidad, documento, idioma</span>. Separador <span className="font-mono text-xs">;</span> o <span className="font-mono text-xs">,</span>.
                </p>
                <button onClick={descargarPlantilla} className="shrink-0 text-sm font-semibold text-aproba-700 hover:underline">Descargar plantilla</button>
              </div>

              <button
                onClick={() => fileRef.current?.click()}
                className="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-8 text-slate-500 transition hover:border-aproba-400 hover:text-aproba-700"
              >
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                <span className="text-sm font-medium">{nombreFichero || "Elegir un fichero CSV"}</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFichero} />

              {filas && (
                <div className="mt-5">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-aproba-100 px-2.5 py-1 font-semibold text-aproba-700">{nValidas} nuevas</span>
                    {filas.filter((f) => f.estado === "duplicado").length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700">{filas.filter((f) => f.estado === "duplicado").length} duplicadas (se omiten)</span>}
                    {filas.filter((f) => f.estado === "sin_nombre").length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-700">{filas.filter((f) => f.estado === "sin_nombre").length} sin nombre (se omiten)</span>}
                  </div>

                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-100 bg-cream-50 text-left text-slate-400"><th className="px-3 py-2 font-semibold">Cliente</th><th className="px-3 py-2 font-semibold">Email</th><th className="hidden px-3 py-2 font-semibold sm:table-cell">Nacionalidad</th><th className="px-3 py-2 text-right font-semibold">Estado</th></tr></thead>
                      <tbody>
                        {filas.slice(0, 8).map((f, i) => (
                          <tr key={i} className="border-b border-slate-50 last:border-0">
                            <td className="px-3 py-2 font-medium text-slate-800">{f.nombre} {f.apellidos}</td>
                            <td className="px-3 py-2 text-slate-500">{f.email || "—"}</td>
                            <td className="hidden px-3 py-2 text-slate-500 sm:table-cell">{f.nacionalidad || "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {f.estado === "ok" && <span className="text-aproba-700">✓ nueva</span>}
                              {f.estado === "duplicado" && <span className="text-amber-600">duplicada</span>}
                              {f.estado === "sin_nombre" && <span className="text-red-600">sin nombre</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filas.length > 8 && <p className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-400">+ {filas.length - 8} filas más</p>}
                  </div>

                  <button onClick={importar} disabled={importando || nValidas === 0} className="mt-4 w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
                    {importando ? "Importando…" : `Importar ${nValidas} cliente${nValidas === 1 ? "" : "s"}`}
                  </button>
                </div>
              )}

              {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
