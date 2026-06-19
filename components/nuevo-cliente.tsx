"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useT } from "@/components/lang-provider";
import {
  FICHA_KEYS, FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, fichaVacia,
  type ClienteFicha,
} from "@/lib/ficha";

// Création de clients existants du gestor : saisie manuelle d'une FICHE COMPLÈTE
// (mêmes champs que le portail « Tus datos » → les formulaires officiels EX/790
// se remplissent intégralement), ou import CSV en masse (doublons + lignes invalides).
// Rien à voir avec « Nuevo expediente » : ici on alimente le fichier clients.

type Campos = Record<keyof ClienteFicha, string> & { idioma: string };
const VACIO: Campos = { ...(fichaVacia() as Record<keyof ClienteFicha, string>), idioma: "es" };

const IDIOMAS = [
  ["es", "Español"],
  ["ca", "Català"],
  ["en", "English"],
  ["fr", "Français"],
  ["ar", "العربية"],
  ["ro", "Română"],
  ["zh", "中文"],
] as const;

// Placeholders d'aide pour quelques champs texte.
const PLACEHOLDER: Partial<Record<keyof ClienteFicha, string>> = {
  nombre: "María Camila", apellidos: "García López", email: "maria@email.com",
  telefono: "612 345 678", nacionalidad: "Colombia", numeroDocumento: "Y1234567Z",
  lugarNacimiento: "Bogotá", paisNacimiento: "Colombia",
  via: "Calle Mayor", numeroVia: "23", piso: "4ºB", codigoPostal: "28013",
  municipio: "Madrid", provincia: "Madrid",
};

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

// En-têtes CSV reconnus (insensible aux accents/majuscules). On gère la fiche complète :
// les colonnes absentes restent vides → null en base (jamais bloquant).
const CABECERAS: Partial<Record<keyof Campos, string[]>> = {
  nombre: ["nombre", "name", "prenom"],
  apellidos: ["apellidos", "apellido", "surname", "nom"],
  email: ["email", "correo", "mail"],
  telefono: ["telefono", "tel", "movil", "phone"],
  nacionalidad: ["nacionalidad", "nationalite"],
  numeroDocumento: ["documento", "numerodocumento", "ndocumento", "nie", "pasaporte", "dni", "passport"],
  sexo: ["sexo", "sex", "genero"],
  fechaNacimiento: ["fechanacimiento", "nacimiento", "fechadenacimiento", "birth", "birthdate"],
  lugarNacimiento: ["lugarnacimiento", "lugardenacimiento", "ciudadnacimiento"],
  paisNacimiento: ["paisnacimiento", "paisdenacimiento"],
  estadoCivil: ["estadocivil", "civil"],
  via: ["via", "domicilio", "direccion", "calle", "address"],
  numeroVia: ["numero", "numerovia", "num"],
  piso: ["piso", "puerta"],
  codigoPostal: ["codigopostal", "cp", "zip"],
  municipio: ["municipio", "localidad", "ciudad", "city"],
  provincia: ["provincia", "province"],
  idioma: ["idioma", "lengua", "language", "langue"],
};

type Fila = Campos & { estado: "ok" | "duplicado" | "sin_nombre" };

export function NuevoCliente() {
  const t = useT();
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
    if (e || !mem) throw new Error(e?.message ?? t("No se encontró tu despacho."));
    return { supabase, ws: mem.workspaceId as string };
  }

  // Construit la ligne Cliente avec TOUTE la fiche (nombre obligatoire, reste null si vide).
  function filaACliente(f: Campos, ws: string) {
    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      workspaceId: ws,
      idioma: f.idioma || "es",
      updatedAt: new Date().toISOString(),
    };
    for (const k of FICHA_KEYS) {
      const v = (f[k] ?? "").trim();
      row[k] = k === "nombre" ? v : (v || null);
    }
    return row;
  }

  // ── Création manuelle ──
  async function guardar(otro: boolean) {
    if (!campos.nombre.trim()) return setError(t("El nombre es obligatorio."));
    setGuardando(true);
    setError(null);
    try {
      const { supabase, ws } = await contexto();
      const nombreGuardado = campos.nombre.trim();
      const { error: e } = await supabase.from("Cliente").insert(filaACliente(campos, ws));
      if (e) throw new Error(e.message);
      if (otro) {
        setCampos(VACIO);
        setToast(`✓ ${nombreGuardado} ${t("añadido")}`);
        window.setTimeout(() => setToast(null), 2500);
      } else {
        router.push("/app/clientes");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo guardar."));
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
      if (rows.length < 2) throw new Error(t("El CSV está vacío (se espera una fila de cabeceras + datos)."));

      // mapper les colonnes depuis la ligne d'en-têtes
      const headers = rows[0].map(norm);
      const idx: Partial<Record<keyof Campos, number>> = {};
      (Object.keys(CABECERAS) as (keyof Campos)[]).forEach((campo) => {
        const i = headers.findIndex((h) => CABECERAS[campo]!.includes(h.replace(/[^a-z]/g, "")));
        if (i >= 0) idx[campo] = i;
      });
      if (idx.nombre === undefined) throw new Error(t('No se encontró la columna "nombre". Descarga la plantilla para ver el formato.'));

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
        const f: Campos = { ...VACIO };
        (Object.keys(CABECERAS) as (keyof Campos)[]).forEach((k) => { f[k] = get(k) || (VACIO[k] ?? ""); });
        f.idioma = get("idioma") || "es";
        let estado: Fila["estado"] = "ok";
        if (!f.nombre) estado = "sin_nombre";
        else if ((f.email && llaves.has("e:" + norm(f.email))) || llaves.has("n:" + norm(`${f.nombre} ${f.apellidos}`))) estado = "duplicado";
        else llaves.add("n:" + norm(`${f.nombre} ${f.apellidos}`)); // dédoublonner aussi à l'intérieur du fichier
        return { ...f, estado };
      });
      setFilas(parsed);
    } catch (err) {
      setFilas(null);
      setError(err instanceof Error ? err.message : t("No se pudo leer el CSV."));
    }
  }

  async function importar() {
    if (!filas) return;
    const validas = filas.filter((f) => f.estado === "ok");
    if (!validas.length) return setError(t("No hay filas nuevas que importar."));
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
      setError(err instanceof Error ? err.message : t("No se pudo importar."));
    } finally {
      setImportando(false);
    }
  }

  function descargarPlantilla() {
    const csv = "﻿nombre;apellidos;email;telefono;nacionalidad;documento;sexo;fechaNacimiento;estadoCivil;via;numero;codigoPostal;municipio;provincia;idioma\n"
      + "Julia;Mendoza Restrepo;julia@email.com;612345678;Colombia;AY0429317;M;1990-05-12;C;Calle Mayor;23;28013;Madrid;Madrid;es\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const input = "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";
  const nValidas = filas?.filter((f) => f.estado === "ok").length ?? 0;

  const set = (k: keyof ClienteFicha | "idioma", v: string) => setCampos((c) => ({ ...c, [k]: v }));

  // Rend l'input adapté au type du champ de la fiche.
  function CampoInput({ c }: { c: (typeof FICHA_CAMPOS)[number] }) {
    const val = campos[c.k] ?? "";
    if (c.tipo === "sexo")
      return <select value={val} onChange={(e) => set(c.k, e.target.value)} className={`${input} bg-white`}>{SEXOS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>;
    if (c.tipo === "estadoCivil")
      return <select value={val} onChange={(e) => set(c.k, e.target.value)} className={`${input} bg-white`}>{ESTADOS_CIVILES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>;
    if (c.tipo === "date")
      return <input type="date" value={val} onChange={(e) => set(c.k, e.target.value)} className={input} />;
    return <input value={val} onChange={(e) => set(c.k, e.target.value)} placeholder={PLACEHOLDER[c.k] ?? ""} className={input} />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Clientes")}
      </Link>

      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Nuevo cliente")}</h1>
      <p className="mt-1 text-slate-500">{t("Añade un cliente que ya tienes, o importa todos de golpe desde un CSV.")}</p>

      {/* Onglets */}
      <div className="mt-6 inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        {([["manual", "Añadir manualmente"], ["csv", "Importar CSV"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setError(null); }} className={`rounded-md px-4 py-2 text-sm font-medium transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t(label)}
          </button>
        ))}
      </div>

      {/* ── Manuel ── */}
      {tab === "manual" && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="mb-4 text-sm text-slate-500">{t("Cuantos más datos rellenes, más completos saldrán los formularios oficiales. Solo el nombre es obligatorio.")}</p>

          {GRUPOS.map((grupo) => (
            <div key={grupo} className="mt-6 first:mt-0">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-aproba-700">{t(grupo)}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {FICHA_CAMPOS.filter((c) => c.grupo === grupo).map((c) => (
                  <div key={c.k} className={c.w === "full" ? "sm:col-span-2" : ""}>
                    <label className="text-sm font-medium text-slate-700">{t(c.label)}{c.k === "nombre" ? " *" : ""}</label>
                    <CampoInput c={c} />
                  </div>
                ))}
                {grupo === "Contacto" && (
                  <div>
                    <label className="text-sm font-medium text-slate-700">{t("Idioma de comunicación")}</label>
                    <select value={campos.idioma} onChange={(e) => set("idioma", e.target.value)} className={`${input} bg-white`}>
                      {IDIOMAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}

          {toast && <p className="mt-4 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-700">{toast}</p>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-6 flex gap-3">
            <button onClick={() => guardar(false)} disabled={guardando} className="flex-1 rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
              {guardando ? t("Guardando…") : t("Guardar cliente")}
            </button>
            <button onClick={() => guardar(true)} disabled={guardando} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
              {t("Guardar y añadir otro")}
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
              <p className="mt-4 text-lg font-bold text-slate-900">{resultado.importados} {t("clientes importados")}</p>
              <p className="mt-1 text-sm text-slate-500">
                {resultado.duplicados > 0 && `${resultado.duplicados} ${t("duplicados omitidos")}`}
                {resultado.duplicados > 0 && resultado.invalidos > 0 && " · "}
                {resultado.invalidos > 0 && `${resultado.invalidos} ${t("filas sin nombre")}`}
                {resultado.duplicados === 0 && resultado.invalidos === 0 && t("Sin incidencias.")}
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link href="/app/clientes" className="rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Ver clientes →")}</Link>
                <button onClick={() => setResultado(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Importar otro CSV")}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-500">
                  {t("Columnas reconocidas")}: <span className="font-mono text-xs">nombre*, apellidos, email, telefono, nacionalidad, documento, sexo, fechaNacimiento, estadoCivil, via, numero, codigoPostal, municipio, provincia, idioma</span>. {t("Separador")} <span className="font-mono text-xs">;</span> {t("o")} <span className="font-mono text-xs">,</span>.
                </p>
                <button onClick={descargarPlantilla} className="shrink-0 text-sm font-semibold text-aproba-700 hover:underline">{t("Descargar plantilla")}</button>
              </div>

              <button
                onClick={() => fileRef.current?.click()}
                className="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-8 text-slate-500 transition hover:border-aproba-400 hover:text-aproba-700"
              >
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                <span className="text-sm font-medium">{nombreFichero || t("Elegir un fichero CSV")}</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFichero} />

              {filas && (
                <div className="mt-5">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-aproba-100 px-2.5 py-1 font-semibold text-aproba-700">{nValidas} {t("nuevas")}</span>
                    {filas.filter((f) => f.estado === "duplicado").length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700">{filas.filter((f) => f.estado === "duplicado").length} {t("duplicadas (se omiten)")}</span>}
                    {filas.filter((f) => f.estado === "sin_nombre").length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-700">{filas.filter((f) => f.estado === "sin_nombre").length} {t("sin nombre (se omiten)")}</span>}
                  </div>

                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-100 bg-cream-50 text-left text-slate-400"><th className="px-3 py-2 font-semibold">{t("Cliente")}</th><th className="px-3 py-2 font-semibold">{t("Email")}</th><th className="hidden px-3 py-2 font-semibold sm:table-cell">{t("Nacionalidad")}</th><th className="px-3 py-2 text-right font-semibold">{t("Estado")}</th></tr></thead>
                      <tbody>
                        {filas.slice(0, 8).map((f, i) => (
                          <tr key={i} className="border-b border-slate-50 last:border-0">
                            <td className="px-3 py-2 font-medium text-slate-800">{f.nombre} {f.apellidos}</td>
                            <td className="px-3 py-2 text-slate-500">{f.email || "—"}</td>
                            <td className="hidden px-3 py-2 text-slate-500 sm:table-cell">{f.nacionalidad || "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {f.estado === "ok" && <span className="text-aproba-700">{t("✓ nueva")}</span>}
                              {f.estado === "duplicado" && <span className="text-amber-600">{t("duplicada")}</span>}
                              {f.estado === "sin_nombre" && <span className="text-red-600">{t("sin nombre")}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filas.length > 8 && <p className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-400">+ {filas.length - 8} {t("filas más")}</p>}
                  </div>

                  <button onClick={importar} disabled={importando || nValidas === 0} className="mt-4 w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
                    {importando ? t("Importando…") : `${t("Importar")} ${nValidas} ${nValidas === 1 ? t("cliente") : t("clientes")}`}
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
