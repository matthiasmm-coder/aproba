"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { EmpresaDetalle } from "@/lib/data/empresas";

// Bloque «Empresa contratante» de la ficha del expediente: quién contrata y paga (la
// hoja de encargo y las facturas la llevan como cliente), sus datos fiscales editables
// en línea, y sus trabajadores con los expedientes de cada uno.

type Campos = { razonSocial: string; nif: string; domicilio: string; codigoPostal: string; municipio: string; provincia: string; contactoNombre: string; contactoEmail: string; contactoTelefono: string };

const deEmpresa = (e: EmpresaDetalle): Campos => ({
  razonSocial: e.razonSocial ?? "", nif: e.nif ?? "", domicilio: e.domicilio ?? "", codigoPostal: e.codigoPostal ?? "",
  municipio: e.municipio ?? "", provincia: e.provincia ?? "", contactoNombre: e.contactoNombre ?? "", contactoEmail: e.contactoEmail ?? "", contactoTelefono: e.contactoTelefono ?? "",
});

export function EmpresaExpedienteSection({ empresa, expedienteId }: { empresa: EmpresaDetalle; expedienteId: string }) {
  const t = useT();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [campos, setCampos] = useState<Campos>(() => deEmpresa(empresa));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Campos, v: string) => setCampos((c) => ({ ...c, [k]: v }));
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  async function guardar() {
    if (!campos.razonSocial.trim()) { setError(t("La razón social es obligatoria.")); return; }
    setGuardando(true); setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campos) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      setEditando(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo guardar."));
    } finally { setGuardando(false); }
  }

  const direccion = [empresa.domicilio, [empresa.codigoPostal, empresa.municipio].filter(Boolean).join(" "), empresa.provincia ? `(${empresa.provincia})` : ""].filter(Boolean).join(" · ");
  const contacto = [empresa.contactoNombre, empresa.contactoEmail, empresa.contactoTelefono].filter(Boolean).join(" · ");
  const trabajadorActual = empresa.trabajadores.find((tr) => tr.expedientes.some((x) => x.id === expedienteId)) ?? null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Empresa contratante")}</p>
          <p className="mt-0.5 truncate text-lg font-semibold text-slate-900">{empresa.razonSocial}</p>
          <p className="text-sm text-slate-500">
            {empresa.nif ? <>{t("CIF / NIF")} <span className="font-mono text-slate-700">{empresa.nif}</span></> : <span className="text-amber-700">{t("Sin CIF: añádelo antes de facturar.")}</span>}
            {direccion && <> · {direccion}</>}
          </p>
          {contacto && <p className="text-sm text-slate-500">{t("Contacto")}: {contacto}</p>}
          <p className="mt-2 text-xs text-slate-500">{t("La hoja de encargo y las facturas se emiten a nombre de la empresa. El trabajador sigue siendo el titular del expediente y firma el mandato.")}</p>
        </div>
        {!editando && (
          <button type="button" onClick={() => { setCampos(deEmpresa(empresa)); setEditando(true); }} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400">{t("Editar")}</button>
        )}
      </div>

      {editando && (
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="text-xs font-medium text-slate-600">{t("Razón social")} *</label><input value={campos.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} className={input} /></div>
            <div><label className="text-xs font-medium text-slate-600">{t("CIF / NIF")}</label><input value={campos.nif} onChange={(e) => set("nif", e.target.value)} className={input} /></div>
            <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-600">{t("Domicilio fiscal")}</label><input value={campos.domicilio} onChange={(e) => set("domicilio", e.target.value)} className={input} /></div>
            <div><label className="text-xs font-medium text-slate-600">{t("Código postal")}</label><input value={campos.codigoPostal} onChange={(e) => set("codigoPostal", e.target.value)} className={input} /></div>
            <div><label className="text-xs font-medium text-slate-600">{t("Municipio")}</label><input value={campos.municipio} onChange={(e) => set("municipio", e.target.value)} className={input} /></div>
            <div><label className="text-xs font-medium text-slate-600">{t("Provincia")}</label><input value={campos.provincia} onChange={(e) => set("provincia", e.target.value)} className={input} /></div>
            <div><label className="text-xs font-medium text-slate-600">{t("Persona de contacto")}</label><input value={campos.contactoNombre} onChange={(e) => set("contactoNombre", e.target.value)} className={input} /></div>
            <div><label className="text-xs font-medium text-slate-600">{t("Email de contacto")}</label><input type="email" value={campos.contactoEmail} onChange={(e) => set("contactoEmail", e.target.value)} className={input} /></div>
            <div><label className="text-xs font-medium text-slate-600">{t("Teléfono de contacto")}</label><input value={campos.contactoTelefono} onChange={(e) => set("contactoTelefono", e.target.value)} className={input} /></div>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={guardar} disabled={guardando} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{guardando ? t("Guardando…") : t("Guardar")}</button>
            <button type="button" onClick={() => { setEditando(false); setError(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Cancelar")}</button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Trabajadores")} ({empresa.trabajadores.length})</p>
        {empresa.trabajadores.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{t("Todavía sin trabajadores.")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-50">
            {empresa.trabajadores.map((tr) => (
              <li key={tr.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link href={`/app/clientes/${tr.id}`} className={`text-sm font-medium hover:underline ${tr.id === trabajadorActual?.id ? "text-aproba-700" : "text-slate-800"}`}>{tr.nombre}</Link>
                {tr.id === trabajadorActual?.id && <span className="rounded-full bg-aproba-100 px-2 py-0.5 text-[11px] font-semibold text-aproba-700">{t("este expediente")}</span>}
                <span className="flex flex-wrap gap-1.5">
                  {tr.expedientes.filter((x) => x.id !== expedienteId).map((x) => (
                    <Link key={x.id} href={`/app/expedientes/${x.id}`} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-400" title={x.tipoLabel}>
                      {x.referencia} · {x.tipoLabel}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
