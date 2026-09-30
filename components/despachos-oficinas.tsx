"use client";

import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { LogoOficina } from "@/components/logo-oficina";

// «DESPACHO Y CUENTA» CON VARIAS OFICINAS (Luis, 30/09/2026: «dos despachos, dos emails y dos
// logos; Marta tiene que poder subir el logo del suyo»). Los datos propios de una oficina
// (razón social, NIF, email, logo) ya existían, pero solo en «Facturación y métodos de pago»,
// donde nadie los buscaba. Aquí se ven todos, el logo se cambia en el sitio y «Editar sus
// datos» abre la pestaña de esa oficina en Facturación (un solo formulario por dato).
export type DespachoOficina = {
  id: string; nombre: string; razonSocial: string | null; nif: string | null; emailFacturacion: string | null; logoUrl: string | null;
};

export function DespachosOficinas({ oficinas, puedeEditar }: { oficinas: DespachoOficina[]; puedeEditar: boolean }) {
  const t = useT();
  if (!oficinas.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Datos de cada oficina")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {t("Su nombre, su email y su logo salen en sus facturas, su hoja de encargo y sus emails. Una oficina sin datos propios usa los del despacho.")}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {oficinas.map((o) => {
          const propios = Boolean((o.razonSocial ?? "").trim() || (o.nif ?? "").trim());
          return (
            <li key={o.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
              <p className="truncate text-sm font-semibold text-slate-800" title={o.nombre}>{(o.razonSocial ?? "").trim() || o.nombre}</p>
              {propios ? (
                <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                  {(o.nif ?? "").trim() && <p>NIF {o.nif}</p>}
                  <p className="truncate" title={o.emailFacturacion ?? ""}>{(o.emailFacturacion ?? "").trim() || t("Sin email propio")}</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-500">{t("Usa los datos del despacho.")}</p>
              )}
              <div className="mt-3">
                <LogoOficina oficinaId={o.id} logoInicial={o.logoUrl} puedeEditar={puedeEditar} />
              </div>
              {puedeEditar && (
                <Link
                  href={`/app/ajustes?abrir=facturacion&oficina=${encodeURIComponent(o.id)}`} scroll={false}
                  className="mt-3 inline-block text-xs font-semibold text-aproba-700 hover:underline"
                >
                  {propios ? t("Editar sus datos (NIF, domicilio, email…)") : t("Darle datos propios")} →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
