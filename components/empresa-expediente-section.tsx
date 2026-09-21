"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import type { EmpresaDetalle } from "@/lib/data/empresas";
import { EmpresaEditor } from "@/components/empresa-editor";
import { TrabajadoresExpediente } from "@/components/trabajadores-expediente";
import type { TrabajadorExpediente } from "@/lib/trabajadores";

// Bloque «Empresa contratante» de la ficha del expediente: quién contrata y paga (la
// hoja de encargo y las facturas la llevan como cliente), sus datos fiscales editables
// en línea, y sus trabajadores con los expedientes de cada uno.

export function EmpresaExpedienteSection({ empresa, expedienteId, trabajadores = [], esDeEmpresa = false, despachoEncargo = false }: {
  empresa: EmpresaDetalle;
  expedienteId: string;
  // Expediente DE EMPRESA (21/09/2026): sin titular persona; los trabajadores del lote.
  trabajadores?: TrabajadorExpediente[];
  esDeEmpresa?: boolean;
  despachoEncargo?: boolean;
}) {
  const t = useT();
  const [editando, setEditando] = useState(false);

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
          {!contacto && esDeEmpresa && <p className="text-sm text-amber-700">{t("Sin persona de contacto: añade su email para enviarle la hoja de encargo y las facturas.")}</p>}
          {esDeEmpresa
            ? <p className="mt-2 text-xs text-slate-500">{t("El expediente es de la empresa: la hoja de encargo y las facturas van a su nombre y las firma su representante. Cada trabajador del lote tiene sus documentos, sus formularios y su propio mandato.")}</p>
            : <p className="mt-2 text-xs text-slate-500">{t("La hoja de encargo y las facturas se emiten a nombre de la empresa. El trabajador sigue siendo el titular del expediente y firma el mandato.")}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <Link href={`/app/empresas/${empresa.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-aproba-300 hover:text-aproba-700">
          {t("Ver ficha")}
        </Link>
        {!editando && (
          <button type="button" onClick={() => setEditando(true)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400">{t("Editar")}</button>
        )}
        </div>
      </div>

      {editando && (
        <div className="border-t border-slate-100 px-5 py-4">
          <EmpresaEditor empresaId={empresa.id} inicial={empresa} onCerrar={() => setEditando(false)} />
        </div>
      )}

      {esDeEmpresa ? (
        <TrabajadoresExpediente
          expedienteId={expedienteId}
          trabajadores={trabajadores}
          candidatos={empresa.trabajadores.filter((tr) => !trabajadores.some((x) => x.id === tr.id)).map((tr) => ({ id: tr.id, nombre: tr.nombre }))}
          despachoEncargo={despachoEncargo}
        />
      ) : (
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
      )}
    </div>
  );
}
