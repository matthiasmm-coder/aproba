"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useT } from "@/components/lang-provider";
import type { CuentaBancaria } from "@/lib/data/config";
import { fmtIban, ibanOculto, ibanValido } from "@/lib/iban";
import { copiarTexto } from "@/lib/copiar";

// Comptes bancaires du despacho — un seul actif (celui qui reçoit les paiements).
// Mutations sous RLS (browser client) ; l'index unique partiel côté DB garantit
// l'unicité du compte actif même en cas de course.
//
// L'IBAN est masqué par défaut (pays + 4 derniers chiffres) : ces écrans se montrent
// en démo et en partage d'écran. « Ver datos » ouvre le détail complet — un seul
// compte ouvert à la fois, et l'ouverture ne survit pas au rechargement.

// `oficinaId` (fase 6): null = cuentas comunes del despacho; con id = las de ESA sede.
// La casilla «activa» es POR ÁMBITO: cada sede tiene su cuenta activa, y la común la suya.
export function CuentasBancarias({ inicial, oficinaId = null }: { inicial: CuentaBancaria[]; oficinaId?: string | null }) {
  const t = useT();
  const router = useRouter();
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>(inicial);
  const [añadiendo, setAñadiendo] = useState(false);
  const [titular, setTitular] = useState("");
  const [iban, setIban] = useState("");
  const [banco, setBanco] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<string | null>(null); // id de la cuenta revelada
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiarIban(c: CuentaBancaria) {
    const ok = await copiarTexto(fmtIban(c.iban));
    if (!ok) { setError(t("No se pudo copiar. Selecciona el IBAN y cópialo a mano.")); return; }
    setError(null);
    setCopiado(c.id);
    setTimeout(() => setCopiado((id) => (id === c.id ? null : id)), 1800);
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo guardar."));
    } finally {
      setBusy(false);
    }
  }

  async function workspaceId(supabase: ReturnType<typeof createSupabaseBrowser>) {
    const { data, error } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "No se encontró tu despacho.");
    return data.workspaceId;
  }

  function activar(id: string) {
    void withBusy(async () => {
      const supabase = createSupabaseBrowser();
      const ws = await workspaceId(supabase);
      // Désactiver l'actuel PUIS activer le nouveau (l'index partiel interdit deux actifs).
      let clear = supabase.from("CuentaBancaria").update({ activa: false }).eq("workspaceId", ws).eq("activa", true);
      // solo el MISMO ámbito: activar la cuenta de Diagonal no debe apagar la común ni la de Gran Via
      clear = oficinaId ? clear.eq("oficinaId", oficinaId) : clear.is("oficinaId", null);
      let { error: e1 } = await clear;
      if (e1 && /oficinaId/i.test(e1.message)) {
        ({ error: e1 } = await supabase.from("CuentaBancaria").update({ activa: false }).eq("workspaceId", ws).eq("activa", true)); // sin migrar
      }
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from("CuentaBancaria").update({ activa: true }).eq("id", id);
      if (e2) throw new Error(e2.message);
      setCuentas((l) => l.map((c) => ({ ...c, activa: c.id === id })));
    });
  }

  function eliminar(id: string) {
    void withBusy(async () => {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.from("CuentaBancaria").delete().eq("id", id);
      if (error) throw new Error(error.message);
      setCuentas((l) => l.filter((c) => c.id !== id));
    });
  }

  function añadir() {
    const ibanLimpio = iban.replace(/\s+/g, "").toUpperCase();
    if (!titular.trim()) return setError(t("Indica el titular de la cuenta."));
    if (!ibanValido(ibanLimpio)) return setError(t("El IBAN no parece válido. Revisa que esté completo y bien copiado (ej. ES91 2100 0418 4502 0005 1332)."));
    void withBusy(async () => {
      const supabase = createSupabaseBrowser();
      const ws = await workspaceId(supabase);
      const nueva = {
        id: crypto.randomUUID(),
        workspaceId: ws,
        titular: titular.trim(),
        iban: ibanLimpio,
        banco: banco.trim() || null,
        activa: cuentas.length === 0, // la première devient active d'office (dans SON ámbito)
      };
      const fila: Record<string, unknown> = oficinaId ? { ...nueva, oficinaId } : { ...nueva };
      let { error } = await supabase.from("CuentaBancaria").insert(fila);
      if (error && oficinaId && /oficinaId/i.test(error.message)) {
        ({ error } = await supabase.from("CuentaBancaria").insert(nueva)); // migración fase 6 ausente
      }
      if (error) throw new Error(error.message);
      setCuentas((l) => [...l, { id: nueva.id, titular: nueva.titular, iban: nueva.iban, banco: nueva.banco, activa: nueva.activa }]);
      setTitular(""); setIban(""); setBanco(""); setAñadiendo(false);
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Cuentas bancarias")}</h3>
        {!añadiendo && (
          <button onClick={() => { setAñadiendo(true); setError(null); }} className="text-sm font-semibold text-aproba-700 hover:underline">{t("+ Añadir cuenta")}</button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">{t("Los pagos de tus clientes se transfieren a la cuenta activa.")}</p>

      <div className="mt-4 space-y-2">
        {cuentas.map((c) => (
          <div key={c.id} className={`rounded-lg border bg-white px-4 py-3 ${c.activa ? "border-aproba-300" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.activa ? "bg-aproba-50 text-aproba-700" : "bg-slate-100 text-slate-400"}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>
              </span>
              {/* `basis-40` (y no solo min-w-0): sin una base, la columna se encoge hasta
                  desaparecer en el móvil en vez de empujar los botones a la línea de abajo.
                  40 (160 px) es lo más ancho que sigue cabiendo junto al icono a 375 px. */}
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium text-slate-800">{c.titular}{c.banco ? <span className="font-normal text-slate-400"> · {c.banco}</span> : null}</p>
                {/* La línea de la ficha se queda enmascarada siempre: el IBAN completo
                    vive en el detalle, y así no aparece dos veces en la misma tarjeta. */}
                <p className="font-mono text-xs text-slate-500">{ibanOculto(c.iban)}</p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <button
                  onClick={() => { setVisible((id) => (id === c.id ? null : c.id)); setError(null); }}
                  aria-expanded={visible === c.id}
                  aria-controls={`cuenta-detalle-${c.id}`}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50"
                >
                  {visible === c.id ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M9.88 9.88a3 3 0 1 0 4.24 4.24" /></svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                  {visible === c.id ? t("Ocultar") : t("Ver datos")}
                </button>
                {c.activa ? (
                  <span className="rounded-full bg-aproba-100 px-2.5 py-0.5 text-xs font-semibold text-aproba-700">{t("Activa")}</span>
                ) : (
                  <>
                    <button onClick={() => activar(c.id)} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50">{t("Activar")}</button>
                    <button onClick={() => eliminar(c.id)} disabled={busy} aria-label={t("Eliminar cuenta")} className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            {visible === c.id && (
              // Detalle completo, tal cual lo verá el cliente en su factura.
              // En el móvil la etiqueta va ENCIMA del valor: en dos columnas, un IBAN
              // acaba partido en una línea por grupo de cuatro cifras.
              <dl id={`cuenta-detalle-${c.id}`} className="mt-3 space-y-2.5 rounded-lg border border-slate-200 bg-cream-50/60 px-3 py-2.5 text-sm">
                <div className="sm:flex sm:gap-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400 sm:w-20 sm:shrink-0 sm:pt-0.5">{t("Titular")}</dt>
                  <dd className="min-w-0 font-medium text-slate-800 sm:flex-1">{c.titular}</dd>
                </div>
                {c.banco && (
                  <div className="sm:flex sm:gap-3">
                    <dt className="text-xs uppercase tracking-wide text-slate-400 sm:w-20 sm:shrink-0 sm:pt-0.5">{t("Banco")}</dt>
                    <dd className="min-w-0 font-medium text-slate-800 sm:flex-1">{c.banco}</dd>
                  </div>
                )}
                <div className="sm:flex sm:gap-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400 sm:w-20 sm:shrink-0 sm:pt-1">{t("IBAN")}</dt>
                  <dd className="min-w-0 sm:flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="min-w-0 break-words font-mono font-medium text-slate-800 select-all">{fmtIban(c.iban)}</span>
                      <button onClick={() => void copiarIban(c)} className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700">
                        {copiado === c.id ? t("Copiado") : t("Copiar")}
                      </button>
                    </div>
                  </dd>
                </div>
              </dl>
            )}
          </div>
        ))}
        {cuentas.length === 0 && !añadiendo && (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">{t("Sin cuentas. Añade la cuenta donde quieres recibir los pagos.")}</p>
        )}
      </div>

      {añadiendo && (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder={t("Titular (ej. Gestoría Vallès SL)")} className="rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
            <input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder={t("Banco (opcional)")} className="rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
          </div>
          <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder={t("IBAN — ES76 2100 0418 4502 0005 1332")} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
          <div className="flex gap-2">
            <button onClick={añadir} disabled={busy} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{busy ? t("Guardando…") : t("Guardar cuenta")}</button>
            <button onClick={() => { setAñadiendo(false); setError(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Cancelar")}</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
