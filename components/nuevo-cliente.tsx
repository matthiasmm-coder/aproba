"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useT } from "@/components/lang-provider";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, type ClienteFicha } from "@/lib/ficha";
import { filaACliente, camposVacios, type ClienteCsvCampos } from "@/lib/csv-clientes";
import { PARENTESCOS, type Parentesco } from "@/lib/familia";

// Création d'un client existant du gestor, en deux modes :
// · INDIVIDUAL — saisie d'une FICHE COMPLÈTE (mêmes champs que le portail « Tus datos »
//   → les formulaires officiels EX/790 se remplissent intégralement).
// · FAMILIA — la familia + ses miembros avec les données ESSENTIELLES (identité/contact) ;
//   la ficha complète de chaque miembro se complète après (editar cliente ou portal).
// L'import en masse (Excel/CSV + mapping IA) se fait via « Importar datos ».

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

// Miembro de la familia: subset de la ficha (identidad + contacto).
type Miembro = {
  key: string; parentesco: Parentesco;
  nombre: string; apellidos: string; fechaNacimiento: string;
  numeroDocumento: string; pasaporte: string; email: string; telefono: string;
};

const nuevoMiembro = (parentesco: Parentesco): Miembro => ({
  key: Math.random().toString(36).slice(2, 9), parentesco,
  nombre: "", apellidos: "", fechaNacimiento: "", numeroDocumento: "", pasaporte: "", email: "", telefono: "",
});

export function NuevoCliente() {
  const t = useT();
  const router = useRouter();
  const [modo, setModo] = useState<"individual" | "familia">("individual");
  const [campos, setCampos] = useState<Campos>(VACIO);
  // Familia: nombre + idioma común + miembros (el primero es el TITULAR).
  const [nombreFamilia, setNombreFamilia] = useState("");
  const [idiomaFam, setIdiomaFam] = useState("es");
  const [miembros, setMiembros] = useState<Miembro[]>([nuevoMiembro("TITULAR")]);
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

  async function guardarFamilia(otra: boolean) {
    const titular = miembros[0];
    if (!titular?.nombre.trim()) return setError(t("El nombre del titular es obligatorio."));
    // Miembros sin nombre se ignoran (tarjetas añadidas y dejadas vacías).
    const rellenos = miembros.filter((m) => m.nombre.trim());
    // Apellidos COMPLETOS: el primer apellido a secas produce nombres absurdos con
    // partículas («El Amrani» → «Familia El», «De la Cruz» → «Familia De»).
    const nombreFam = nombreFamilia.trim()
      || (titular.apellidos.trim() ? `${t("Familia")} ${titular.apellidos.trim()}` : "");
    if (!nombreFam) return setError(t("Indica el nombre de la familia (o los apellidos del titular)."));
    setGuardando(true);
    setError(null);
    try {
      const { supabase, ws } = await contexto();
      const famId = crypto.randomUUID();
      const { error: eF } = await supabase.from("Familia").insert({ id: famId, workspaceId: ws, nombre: nombreFam, updatedAt: new Date().toISOString() });
      if (eF) throw new Error(eF.message);
      let insertados = 0;
      const fallos: string[] = [];
      for (const m of rellenos) {
        const c: Campos = {
          ...camposVacios(), idioma: idiomaFam,
          nombre: m.nombre, apellidos: m.apellidos, fechaNacimiento: m.fechaNacimiento,
          numeroDocumento: m.numeroDocumento, pasaporte: m.pasaporte, email: m.email, telefono: m.telefono,
        };
        const { error: eM } = await supabase.from("Cliente").insert({ ...filaACliente(c, ws), familiaId: famId, parentesco: m.parentesco });
        if (eM) fallos.push(`${m.nombre.trim()}: ${eM.message}`);
        else insertados++;
      }
      if (insertados === 0) {
        // Ningún miembro entró: no dejar una familia vacía huérfana.
        await supabase.from("Familia").delete().eq("id", famId);
        throw new Error(fallos[0] ?? t("No se pudo guardar."));
      }
      if (fallos.length) throw new Error(`${t("Familia creada, pero estos miembros fallaron:")} ${fallos.join(" · ")}`);
      if (otra) {
        setNombreFamilia("");
        setMiembros([nuevoMiembro("TITULAR")]);
        setToast(`✓ ${nombreFam} ${t("añadida")} · ${insertados} ${insertados === 1 ? t("miembro") : t("miembros")}`);
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

  const setMiembro = (key: string, patch: Partial<Miembro>) =>
    setMiembros((l) => l.map((m) => (m.key === key ? { ...m, ...patch } : m)));

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

  const esFamilia = modo === "familia";

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

      {/* Individual ↔ Familia */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          aria-pressed={!esFamilia}
          onClick={() => { setModo("individual"); setError(null); }}
          className={`rounded-xl border-2 p-4 text-left transition ${!esFamilia ? "border-aproba-600 bg-aproba-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
        >
          <p className="text-sm font-semibold text-slate-900">{t("Cliente individual")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("Una persona con su ficha completa")}</p>
        </button>
        <button
          type="button"
          aria-pressed={esFamilia}
          onClick={() => { setModo("familia"); setError(null); }}
          className={`rounded-xl border-2 p-4 text-left transition ${esFamilia ? "border-aproba-600 bg-aproba-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
        >
          <p className="text-sm font-semibold text-slate-900">{t("Familia")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("Varios miembros agrupados en un dossier")}</p>
        </button>
      </div>

      {!esFamilia && (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
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
      )}

      {esFamilia && (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-4 text-sm text-slate-500">{t("Crea la familia con los datos esenciales de cada miembro. Después podrás completar la ficha de cada uno desde su ficha de cliente o su portal.")}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">{t("Nombre de la familia")}</label>
            <input value={nombreFamilia} onChange={(e) => setNombreFamilia(e.target.value)} placeholder={t("Familia García (si lo dejas vacío, se usa el apellido del titular)")} className={input} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t("Idioma de comunicación")}</label>
            <select value={idiomaFam} onChange={(e) => setIdiomaFam(e.target.value)} className={`${input} bg-white`}>
              {IDIOMAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {miembros.map((m, i) => (
            <div key={m.key} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                {i === 0 ? (
                  <span className="rounded-full bg-aproba-600 px-2.5 py-1 text-xs font-semibold text-white">{t("Titular")}</span>
                ) : (
                  <select
                    value={m.parentesco}
                    onChange={(e) => setMiembro(m.key, { parentesco: e.target.value as Parentesco })}
                    aria-label={t("Parentesco del miembro")}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-aproba-600"
                  >
                    {PARENTESCOS.filter(([v]) => v !== "TITULAR").map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
                  </select>
                )}
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => setMiembros((l) => l.filter((x) => x.key !== m.key))}
                    aria-label={`${t("Quitar")} ${m.nombre || t("miembro")}`}
                    className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">{t("Nombre")}{i === 0 ? " *" : ""}</label>
                  <input value={m.nombre} onChange={(e) => setMiembro(m.key, { nombre: e.target.value })} placeholder={PLACEHOLDER.nombre} className={input} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">{t("Apellidos")}</label>
                  <input value={m.apellidos} onChange={(e) => setMiembro(m.key, { apellidos: e.target.value })} placeholder={PLACEHOLDER.apellidos} className={input} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">{t("Fecha de nacimiento")}</label>
                  <input type="date" value={m.fechaNacimiento} onChange={(e) => setMiembro(m.key, { fechaNacimiento: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">NIE</label>
                  <input value={m.numeroDocumento} onChange={(e) => setMiembro(m.key, { numeroDocumento: e.target.value })} placeholder={PLACEHOLDER.numeroDocumento} className={input} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">{t("Pasaporte / doc. de identidad")}</label>
                  <input value={m.pasaporte} onChange={(e) => setMiembro(m.key, { pasaporte: e.target.value })} placeholder={PLACEHOLDER.pasaporte} className={input} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input type="email" value={m.email} onChange={(e) => setMiembro(m.key, { email: e.target.value })} placeholder={PLACEHOLDER.email} className={input} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">{t("Teléfono")}</label>
                  <input type="tel" value={m.telefono} onChange={(e) => setMiembro(m.key, { telefono: e.target.value })} placeholder={PLACEHOLDER.telefono} className={input} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMiembros((l) => [...l, nuevoMiembro(l.length === 1 ? "CONYUGE" : "HIJO")])}
          className="mt-3 text-sm font-semibold text-aproba-700 hover:underline"
        >
          {t("+ Añadir miembro")}
        </button>

        {toast && <p className="mt-4 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-700">{toast}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button onClick={() => guardarFamilia(false)} disabled={guardando} className="flex-1 rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
            {guardando ? t("Guardando…") : t("Guardar familia")}
          </button>
          <button onClick={() => guardarFamilia(true)} disabled={guardando} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
            {t("Guardar y añadir otra")}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
