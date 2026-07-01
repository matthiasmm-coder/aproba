"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { PARENTESCOS, parentescoLabel } from "@/lib/familia";
import { useT } from "@/components/lang-provider";

type Miembro = { nombre: string; apellidos: string; telefono: string; parentesco: string };
type Resultado = { nombre: string; parentesco: string; referencia: string; token: string };

const nuevoMiembro = (parentesco = "HIJO"): Miembro => ({ nombre: "", apellidos: "", telefono: "", parentesco });

export default function NuevaFamilia() {
  const t = useT();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [miembros, setMiembros] = useState<Miembro[]>([nuevoMiembro("TITULAR"), nuevoMiembro("CONYUGE")]);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [familiaId, setFamiliaId] = useState("");
  const [gestoria, setGestoria] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createSupabaseBrowser();
      const { data: mem } = await sb.from("Membership").select("Workspace(nombre)").limit(1).maybeSingle();
      const ws = mem ? (Array.isArray(mem.Workspace) ? mem.Workspace[0] : mem.Workspace) : null;
      if (ws?.nombre) setGestoria(ws.nombre as string);
    })();
  }, []);

  const setMiembro = (i: number, patch: Partial<Miembro>) => setMiembros((m) => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const canCrear = Boolean(nombre.trim()) && miembros.some((m) => m.nombre.trim()) && !creando;

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const sb = createSupabaseBrowser();
      const { data: mem, error: e1 } = await sb.from("Membership").select("workspaceId").limit(1).maybeSingle();
      if (e1 || !mem) throw new Error(e1?.message ?? t("No se encontró tu despacho."));
      const fid = crypto.randomUUID();
      const { error: e2 } = await sb.from("Familia").insert({ id: fid, workspaceId: mem.workspaceId, nombre: nombre.trim(), updatedAt: new Date().toISOString() });
      if (e2) throw new Error(/familia|schema cache|relation|does not exist|column/i.test(e2.message) ? t("Falta la migración de familias: ejecuta supabase/familia.sql en Supabase.") : e2.message);

      const validos = miembros.filter((m) => m.nombre.trim());
      const res: Resultado[] = [];
      for (const m of validos) {
        const r = await fetch("/api/expedientes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nuevo: { nombre: m.nombre.trim(), apellidos: m.apellidos.trim(), telefono: m.telefono.trim() }, familiaId: fid, parentesco: m.parentesco }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? t("No se pudo crear el expediente de un miembro."));
        res.push({ nombre: `${m.nombre.trim()} ${m.apellidos.trim()}`.trim(), parentesco: m.parentesco, referencia: d.referencia, token: d.portalToken });
      }
      setFamiliaId(fid);
      setResultados(res);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo crear la familia."));
    } finally {
      setCreando(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inp = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  // ── Resultado ──
  if (resultados) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-aproba-600">
          <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tightest text-slate-900">{t("Familia creada")}</h1>
        <p className="mt-1 text-center text-slate-500">{nombre} · {resultados.length} {resultados.length === 1 ? t("miembro") : t("miembros")}</p>
        <p className="mx-auto mt-3 max-w-md text-center text-sm text-slate-500">{t("Envía a cada miembro (o al titular) su enlace para que elija su trámite y suba sus documentos.")}</p>

        <div className="mt-6 space-y-2">
          {resultados.map((r) => {
            const url = `${origin}/j/${r.token}`;
            const wa = `https://wa.me/?text=${encodeURIComponent(`Hola, soy de ${gestoria || "tu gestoría"}. Para tu trámite de extranjería, entra aquí y sube tus documentos: ${url}`)}`;
            return (
              <div key={r.token} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{r.nombre}</p>
                    <p className="text-xs text-slate-400">{parentescoLabel(r.parentesco)} · <span className="font-mono">{r.referencia}</span></p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => { navigator.clipboard?.writeText(url); setCopiado(r.token); window.setTimeout(() => setCopiado((c) => (c === r.token ? null : c)), 1500); }} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400">
                      {copiado === r.token ? t("¡Copiado!") : t("Copiar enlace")}
                    </button>
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-md bg-[#25D366] px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-95">WhatsApp</a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-center gap-3 text-sm">
          <Link href={`/app/familias/${familiaId}`} className="font-semibold text-aproba-700 hover:underline">{t("Ver la familia →")}</Link>
          <span className="text-slate-300">·</span>
          <Link href="/app/familias" className="text-slate-500 hover:text-slate-800">{t("Todas las familias")}</Link>
        </div>
      </div>
    );
  }

  // ── Formulario ──
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/app/familias" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Familias")}
      </Link>
      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Nueva familia")}</h1>
      <p className="mt-1 text-slate-500">{t("Nombra la familia y añade a sus miembros. Cada uno tendrá su propio expediente, agrupados aquí.")}</p>

      <div className="mt-6">
        <label className="text-sm font-medium text-slate-700">{t("Nombre de la familia")}</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("Familia García López")} className={inp} />
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Miembros")}</p>
        {miembros.map((m, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <select value={m.parentesco} onChange={(e) => setMiembro(i, { parentesco: e.target.value })} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-aproba-600 bg-white">
                {PARENTESCOS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
              </select>
              {miembros.length > 1 && (
                <button onClick={() => setMiembros((x) => x.filter((_, j) => j !== i))} aria-label={t("Quitar")} className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input value={m.nombre} onChange={(e) => setMiembro(i, { nombre: e.target.value })} placeholder={t("Nombre")} className={inp} />
              <input value={m.apellidos} onChange={(e) => setMiembro(i, { apellidos: e.target.value })} placeholder={t("Apellidos")} className={inp} />
              <input value={m.telefono} onChange={(e) => setMiembro(i, { telefono: e.target.value })} placeholder={t("Teléfono (WhatsApp)")} className={`${inp} col-span-2`} />
            </div>
          </div>
        ))}
        <button onClick={() => setMiembros((x) => [...x, nuevoMiembro("HIJO")])} className="text-sm font-semibold text-aproba-700 hover:underline">+ {t("Añadir miembro")}</button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button onClick={crear} disabled={!canCrear} className="mt-6 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
        {creando ? t("Creando…") : t("Crear familia y sus expedientes")}
      </button>
    </div>
  );
}
