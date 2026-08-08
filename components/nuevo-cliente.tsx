"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useT } from "@/components/lang-provider";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, type ClienteFicha } from "@/lib/ficha";
import { filaACliente, camposVacios, type ClienteCsvCampos } from "@/lib/csv-clientes";

// Création d'un client existant du gestor : saisie manuelle d'une FICHE COMPLÈTE
// (mêmes champs que le portail « Tus datos » → les formulaires officiels EX/790 se
// remplissent intégralement). L'import en masse (Excel/CSV + mapping IA) se fait via
// « Importar datos ». Rien à voir avec « Nuevo expediente » : ici on alimente le fichier clients.

type Campos = ClienteCsvCampos;
const VACIO: Campos = camposVacios();

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
  telefono: "612 345 678", nacionalidad: "Colombia", numeroDocumento: "Y1234567Z", pasaporte: "AB123456",
  lugarNacimiento: "Bogotá", paisNacimiento: "Colombia",
  via: "Calle Mayor", numeroVia: "23", piso: "4ºB", codigoPostal: "28013",
  municipio: "Madrid", provincia: "Madrid",
};

export function NuevoCliente() {
  const t = useT();
  const router = useRouter();
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function contexto() {
    const supabase = createSupabaseBrowser();
    const { data: mem, error: e } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
    if (e || !mem) throw new Error(e?.message ?? t("No se encontró tu despacho."));
    return { supabase, ws: mem.workspaceId as string };
  }

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

  const input = "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  const set = (k: keyof ClienteFicha | "idioma", v: string) => setCampos((c) => ({ ...c, [k]: v }));

  // Rend l'input adapté au type du champ de la fiche. FONCTION appelée dans le JSX,
  // PAS un composant (<CampoInput/>) : défini dans le corps du render, un composant
  // changerait d'identité à chaque frappe → React démonte/remonte l'input et le champ
  // perd le focus à chaque lettre.
  const campoInput = (c: (typeof FICHA_CAMPOS)[number]) => {
    const val = campos[c.k] ?? "";
    if (c.tipo === "sexo")
      return <select value={val} onChange={(e) => set(c.k, e.target.value)} className={`${input} bg-white`}>{SEXOS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>;
    if (c.tipo === "estadoCivil")
      return <select value={val} onChange={(e) => set(c.k, e.target.value)} className={`${input} bg-white`}>{ESTADOS_CIVILES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>;
    if (c.tipo === "date")
      return <input type="date" value={val} onChange={(e) => set(c.k, e.target.value)} className={input} />;
    return <input value={val} onChange={(e) => set(c.k, e.target.value)} placeholder={PLACEHOLDER[c.k] ?? ""} className={input} />;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Clientes")}
      </Link>

      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Nuevo cliente")}</h1>
      <p className="mt-1 text-slate-500">
        {t("Añade un cliente que ya tienes a tu cartera.")}{" "}
        <Link href="/app/importar" className="font-medium text-aproba-700 hover:underline">{t("¿Muchos de golpe? Importar datos →")}</Link>
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-4 text-sm text-slate-500">{t("Cuantos más datos rellenes, más completos saldrán los formularios oficiales. Solo el nombre es obligatorio.")}</p>

        {GRUPOS.map((grupo) => (
          <div key={grupo} className="mt-6 first:mt-0">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-aproba-700">{t(grupo)}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {FICHA_CAMPOS.filter((c) => c.grupo === grupo).map((c) => (
                <div key={c.k} className={c.w === "full" ? "sm:col-span-2" : ""}>
                  <label className="text-sm font-medium text-slate-700">{t(c.label)}{c.k === "nombre" ? " *" : ""}</label>
                  {campoInput(c)}
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
    </div>
  );
}
