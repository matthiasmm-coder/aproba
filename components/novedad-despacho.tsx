"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { Novedad } from "@/lib/novedades";

// Aviso de novedad dirigido a un despacho (lib/novedades.ts). Va en el flujo de la página,
// arriba del contenido: nunca tapa la guía de activación ni el botón «Ayuda». Se retira al
// abrirlo o al pulsar «Entendido», y no vuelve en ese navegador.
const clave = (id: string) => `aproba.novedad.${id}`;

export function NovedadDespacho({ novedad }: { novedad: Novedad }) {
  const t = useT();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false); // sin parpadeo antes de leer localStorage
  useEffect(() => {
    try { setVisible(localStorage.getItem(clave(novedad.id)) !== "1"); } catch { setVisible(true); }
  }, [novedad.id]);
  const cerrar = () => {
    try { localStorage.setItem(clave(novedad.id), "1"); } catch { /* sin almacenamiento: se cierra solo aquí */ }
    setVisible(false);
  };
  if (!visible) return null;
  const yaEnDestino = pathname === novedad.href;

  return (
    <div role="status" className="mx-auto mb-5 max-w-5xl print:hidden">
      <div className="flex flex-col gap-3 rounded-2xl border border-aproba-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <span aria-hidden className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aproba-50 text-aproba-600 sm:flex">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /><path d="m9 15 2 2 4-4" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-slate-900">
            <span className="mr-2 inline-block rounded-full bg-aproba-100 px-2 py-0.5 align-[2px] text-[11px] font-semibold uppercase tracking-wide text-aproba-700">{t("Novedad")}</span>
            {t(novedad.titulo)}
          </p>
          <p className="mt-1 text-sm leading-snug text-slate-600">{t(novedad.texto)}</p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {!yaEnDestino && (
            <Link href={novedad.href} onClick={cerrar} className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700">
              {t(novedad.cta)}
            </Link>
          )}
          <button type="button" onClick={cerrar} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-800">
            {t("Entendido")}
          </button>
        </div>
      </div>
    </div>
  );
}
