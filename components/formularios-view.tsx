"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Expediente } from "@/lib/types";
import { useT } from "@/components/lang-provider";
import { Tasa790Modal } from "./tasa790-modal";

const IconDescarga = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
);

export function FormulariosView({ exp, oficiales = [], todos = [] }: { exp: Expediente; oficiales?: string[]; todos?: { code: string; label: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [marcando, setMarcando] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);

  const mostrados = [...new Set([...oficiales, ...extra])];
  const porAñadir = todos.filter((t) => !mostrados.includes(t.code));
  const urlOficial = (tipo: string) => `/api/expedientes/${exp.id}/formularios?tipo=${encodeURIComponent(tipo)}&modo=oficial`;

  async function marcarGenerados() {
    setMarcando(true);
    const res = await fetch(`/api/expedientes/${exp.id}/formularios`, { method: "POST" });
    setMarcando(false);
    if (res.ok) { setMarcado(true); router.refresh(); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/app/expedientes/${exp.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          {t("Volver al expediente")}
        </Link>
      </div>

      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Formularios oficiales")}</h1>
        <p className="text-sm text-slate-500">{exp.clienteNombre} · {exp.tipoLabel}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-800">{t("Modelos del Ministerio, rellenados con los datos del expediente")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("Rellenamos los datos de la persona extranjera. Revisa, marca el tipo de trámite y firma antes de presentar.")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {mostrados.map((tipo) => (
            <a
              key={tipo}
              href={urlOficial(tipo)}
              className="inline-flex items-center gap-2 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700"
            >
              {IconDescarga}
              {tipo} {t("rellenado")}
            </a>
          ))}

          {/* Tasa oficial (proxy Sede Policía Nacional) */}
          <Tasa790Modal expedienteId={exp.id} />
        </div>

        {/* Añadir un modelo que no está vinculado automáticamente al trámite */}
        {porAñadir.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-400">{t("¿Necesitas otro modelo?")}</span>
            <select
              value=""
              onChange={(e) => { if (e.target.value) setExtra((x) => [...x, e.target.value]); }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 outline-none focus:border-aproba-600"
            >
              <option value="">{t("+ Añadir formulario…")}</option>
              {porAñadir.map((t) => (
                <option key={t.code} value={t.code}>{t.code} — {t.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
          <button
            onClick={marcarGenerados}
            disabled={marcando || marcado}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-60"
          >
            {marcado ? (<><svg className="h-4 w-4 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{t("Marcados como generados")}</>)
              : marcando ? t("Guardando…") : t("Marcar como generados")}
          </button>
        </div>
      </div>
    </div>
  );
}
