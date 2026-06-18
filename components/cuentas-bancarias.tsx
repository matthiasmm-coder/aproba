"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useT } from "@/components/lang-provider";
import type { CuentaBancaria } from "@/lib/data/config";

// Comptes bancaires du despacho — un seul actif (celui qui reçoit les paiements).
// Mutations sous RLS (browser client) ; l'index unique partiel côté DB garantit
// l'unicité du compte actif même en cas de course.

const fmtIban = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
const ibanValido = (iban: string) => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban.replace(/\s+/g, "").toUpperCase());

export function CuentasBancarias({ inicial }: { inicial: CuentaBancaria[] }) {
  const t = useT();
  const router = useRouter();
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>(inicial);
  const [añadiendo, setAñadiendo] = useState(false);
  const [titular, setTitular] = useState("");
  const [iban, setIban] = useState("");
  const [banco, setBanco] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { error: e1 } = await supabase.from("CuentaBancaria").update({ activa: false }).eq("workspaceId", ws).eq("activa", true);
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
    if (!ibanValido(ibanLimpio)) return setError(t("El IBAN no parece válido (ej. ES76 2100 0418 4502 0005 1332)."));
    void withBusy(async () => {
      const supabase = createSupabaseBrowser();
      const ws = await workspaceId(supabase);
      const nueva = {
        id: crypto.randomUUID(),
        workspaceId: ws,
        titular: titular.trim(),
        iban: ibanLimpio,
        banco: banco.trim() || null,
        activa: cuentas.length === 0, // la première devient active d'office
      };
      const { error } = await supabase.from("CuentaBancaria").insert(nueva);
      if (error) throw new Error(error.message);
      setCuentas((l) => [...l, { id: nueva.id, titular: nueva.titular, iban: nueva.iban, banco: nueva.banco, activa: nueva.activa }]);
      setTitular(""); setIban(""); setBanco(""); setAñadiendo(false);
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Cuentas bancarias")}</h3>
        {!añadiendo && (
          <button onClick={() => { setAñadiendo(true); setError(null); }} className="text-sm font-semibold text-aproba-700 hover:underline">{t("+ Añadir cuenta")}</button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">{t("Los pagos de tus clientes se transfieren a la cuenta activa.")}</p>

      <div className="mt-4 space-y-2">
        {cuentas.map((c) => (
          <div key={c.id} className={`flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 ${c.activa ? "border-aproba-300" : "border-slate-200"}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.activa ? "bg-aproba-50 text-aproba-700" : "bg-slate-100 text-slate-400"}`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{c.titular}{c.banco ? <span className="font-normal text-slate-400"> · {c.banco}</span> : null}</p>
              <p className="truncate font-mono text-xs text-slate-500">{fmtIban(c.iban)}</p>
            </div>
            {c.activa ? (
              <span className="shrink-0 rounded-full bg-aproba-100 px-2.5 py-0.5 text-xs font-semibold text-aproba-700">{t("Activa")}</span>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => activar(c.id)} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50">{t("Activar")}</button>
                <button onClick={() => eliminar(c.id)} disabled={busy} aria-label={t("Eliminar cuenta")} className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
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
            <input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder={t("Titular (ej. Gestoría Vallès SL)")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
            <input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder={t("Banco (opcional)")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
          </div>
          <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder={t("IBAN — ES76 2100 0418 4502 0005 1332")} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
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
