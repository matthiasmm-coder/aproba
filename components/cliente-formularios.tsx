"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Génère un formulaire officiel autorrellené avec les données de CE client,
// indépendamment d'un expediente/service. Catalogue passé depuis le serveur.
export function ClienteFormularios({ clienteId, formularios }: { clienteId: string; formularios: { code: string; label: string }[] }) {
  const t = useT();
  const [tipo, setTipo] = useState(formularios[0]?.code ?? "");

  function descargar() {
    if (!tipo) return;
    window.location.href = `/api/clientes/${clienteId}/formularios?tipo=${encodeURIComponent(tipo)}`;
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Formularios oficiales")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("Genera un formulario oficial autorrellenado con los datos de este cliente.")}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
        >
          {formularios.map((f) => (
            <option key={f.code} value={f.code}>{f.code} · {f.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={descargar}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          {t("Descargar")}
        </button>
      </div>
    </div>
  );
}
