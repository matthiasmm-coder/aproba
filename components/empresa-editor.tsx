"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { EmpresaFiscal } from "@/lib/empresa";

// Formulario de datos fiscales de una EMPRESA cliente. Compartido por el bloque «Empresa
// contratante» de la ficha del expediente y por la ficha propia de la empresa
// (/app/empresas/[id]) — un solo sitio donde tocar los campos y la validación.

type Campos = { razonSocial: string; nif: string; domicilio: string; codigoPostal: string; municipio: string; provincia: string; contactoNombre: string; contactoEmail: string; contactoTelefono: string };

export const camposDeEmpresa = (e: EmpresaFiscal & { razonSocial: string }): Campos => ({
  razonSocial: e.razonSocial ?? "", nif: e.nif ?? "", domicilio: e.domicilio ?? "", codigoPostal: e.codigoPostal ?? "",
  municipio: e.municipio ?? "", provincia: e.provincia ?? "", contactoNombre: e.contactoNombre ?? "", contactoEmail: e.contactoEmail ?? "", contactoTelefono: e.contactoTelefono ?? "",
});

export function EmpresaEditor({ empresaId, inicial, onCerrar }: {
  empresaId: string;
  inicial: EmpresaFiscal & { razonSocial: string };
  onCerrar: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [campos, setCampos] = useState<Campos>(() => camposDeEmpresa(inicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Campos, v: string) => setCampos((c) => ({ ...c, [k]: v }));
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  async function guardar() {
    if (!campos.razonSocial.trim()) { setError(t("La razón social es obligatoria.")); return; }
    setGuardando(true); setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campos) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      onCerrar();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo guardar."));
    } finally { setGuardando(false); }
  }

  const campo = (k: keyof Campos, label: string, extra: { tipo?: string; ancho?: boolean; auto?: string } = {}) => (
    <div className={extra.ancho ? "sm:col-span-2" : undefined}>
      <label className="text-xs font-medium text-slate-600">{t(label)}{k === "razonSocial" ? " *" : ""}</label>
      <input
        type={extra.tipo ?? "text"} name={k} autoComplete={extra.auto ?? "off"}
        value={campos[k]} onChange={(e) => set(k, e.target.value)} className={input}
      />
    </div>
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("razonSocial", "Razón social", { auto: "organization", ancho: true })}
        {campo("nif", "CIF / NIF")}
        {campo("domicilio", "Domicilio fiscal", { auto: "street-address", ancho: true })}
        {campo("codigoPostal", "Código postal", { auto: "postal-code" })}
        {campo("municipio", "Municipio")}
        {campo("provincia", "Provincia")}
        {campo("contactoNombre", "Persona de contacto")}
        {campo("contactoEmail", "Email de contacto", { tipo: "email", auto: "email" })}
        {campo("contactoTelefono", "Teléfono de contacto")}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={guardar} disabled={guardando} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
          {guardando ? t("Guardando…") : t("Guardar")}
        </button>
        <button type="button" onClick={() => { setError(null); onCerrar(); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
          {t("Cancelar")}
        </button>
      </div>
    </div>
  );
}
