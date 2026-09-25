"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { eur, FACTURA_ESTADO_META, type FacturaEstado } from "@/lib/facturas";
import { EmpresaEditor } from "@/components/empresa-editor";
import { MarcarCobroPrevio } from "@/components/cobro-previo";
import { DocumentosEmpresa } from "@/components/documentos-empresa";
import type { DocEmpresaItem } from "@/lib/documentos-empresa";
import type { EmpresaFicha } from "@/lib/data/empresas";

// FICHA DE LA EMPRESA (18/09/2026, petición de Luis y Marta): la empresa que contrata y
// paga tiene su propia ficha, separada de la del trabajador. Aquí: sus datos fiscales, lo
// que ha contratado, sus facturas y sus trabajadores — con «Añadir trabajador» sin salir.
// 25/09/2026: una empresa puede ser cliente SIN trabajadores (consultas, informes): sus
// expedientes propios, «+ Nuevo expediente» y lo que se le facturó antes de Aproba.

export function EmpresaFichaView({ ficha, documentos = [], subidaDocumentos = true }: { ficha: EmpresaFicha; documentos?: DocEmpresaItem[]; subidaDocumentos?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [anadiendo, setAnadiendo] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", apellidos: "", email: "", telefono: "", nacionalidad: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const direccion = [ficha.domicilio, [ficha.codigoPostal, ficha.municipio].filter(Boolean).join(" "), ficha.provincia ? `(${ficha.provincia})` : ""].filter(Boolean).join(" · ");
  const contacto = [ficha.contactoNombre, ficha.contactoEmail, ficha.contactoTelefono].filter(Boolean).join(" · ");
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  async function anadirTrabajador() {
    if (!nuevo.nombre.trim()) { setError(t("El nombre del trabajador es obligatorio.")); return; }
    setGuardando(true); setError(null);
    try {
      const res = await fetch(`/api/empresas/${ficha.id}/trabajadores`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nuevo) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo añadir el trabajador."));
      setNuevo({ nombre: "", apellidos: "", email: "", telefono: "", nacionalidad: "" });
      setAnadiendo(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo añadir el trabajador."));
    } finally { setGuardando(false); }
  }

  const Tarjeta = ({ label, valor, tono = "text-slate-900", nota }: { label: string; valor: string; tono?: string; nota?: string }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tightest ${tono}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-slate-400">{nota}</p>}
    </div>
  );
  // Las tarjetas incluyen lo facturado antes de Aproba: se dice cuánto, para que cuadre.
  const antes = ficha.historialTotales.importe > 0 ? `${t("Antes de Aproba:")} ${eur(ficha.historialTotales.importe)}` : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/app/clientes?pestana=empresas" className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Empresas")}
      </Link>

      {/* Identidad + datos fiscales */}
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Empresa cliente")}</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tightest text-slate-900">{ficha.razonSocial}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {ficha.nif ? <>{t("CIF / NIF")} <span className="font-mono text-slate-700">{ficha.nif}</span></> : <span className="text-amber-700">{t("Sin CIF: añádelo antes de facturar.")}</span>}
              {direccion && <> · {direccion}</>}
            </p>
            {contacto && <p className="text-sm text-slate-500">{t("Contacto")}: {contacto}</p>}
            <p className="mt-2 text-xs text-slate-500">{t("La hoja de encargo y las facturas se emiten a nombre de la empresa. Cada trabajador sigue siendo el titular de su expediente y tiene su propia ficha.")}</p>
          </div>
          {!editando && (
            <button type="button" onClick={() => setEditando(true)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400">
              {t("Editar datos")}
            </button>
          )}
        </div>
        {editando && (
          <div className="border-t border-slate-100 px-5 py-4">
            <EmpresaEditor empresaId={ficha.id} inicial={ficha} onCerrar={() => setEditando(false)} />
          </div>
        )}
      </div>

      {/* Dinero: lo que esta empresa ha generado */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Tarjeta label={t("Facturado")} valor={eur(ficha.totales.facturado)} nota={antes} />
        <Tarjeta label={t("Cobrado")} valor={eur(ficha.totales.cobrado)} tono="text-aproba-700" />
        <Tarjeta label={t("Pendiente de cobro")} valor={eur(ficha.totales.pendiente)} tono={ficha.totales.pendiente > 0 ? "text-amber-600" : "text-slate-900"} />
      </div>

      {/* Servicios contratados (expedientes de la empresa y de sus trabajadores) */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Servicios contratados")}</p>
          <Link href={`/app/expedientes/nuevo?empresa=${ficha.id}`} className="rounded-lg border border-aproba-300 px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50">
            {t("+ Nuevo expediente")}
          </Link>
        </div>
        {ficha.servicios.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{t("Todavía sin expedientes: ábrele uno a la empresa (una consulta, un informe…) o a uno de sus trabajadores.")}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {ficha.servicios.map((s) => (
              <span key={s.clave} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-cream-50/60 px-3 py-1 text-sm text-slate-700">
                {s.label}
                <span className="rounded-full bg-white px-1.5 text-xs font-semibold text-slate-500">{s.expedientes}</span>
              </span>
            ))}
          </div>
        )}
        {ficha.expedientesPropios.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">{t("Expedientes de la empresa")}:</span>
            {ficha.expedientesPropios.map((x) => (
              <Link key={x.id} href={`/app/expedientes/${x.id}`} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 transition hover:border-slate-400">
                {x.referencia} · {x.tipoLabel}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Trabajadores + alta rápida */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Trabajadores")} ({ficha.trabajadores.length})</p>
          {!anadiendo && (
            <button type="button" onClick={() => { setError(null); setAnadiendo(true); }} className="rounded-lg border border-aproba-300 px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50">
              {t("+ Añadir trabajador")}
            </button>
          )}
        </div>
        {anadiendo && (
          <div className="border-t border-slate-100 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="text-xs font-medium text-slate-600">{t("Nombre")} *</label><input name="nombre" autoComplete="off" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={input} /></div>
              <div><label className="text-xs font-medium text-slate-600">{t("Apellidos")}</label><input name="apellidos" autoComplete="off" value={nuevo.apellidos} onChange={(e) => setNuevo({ ...nuevo, apellidos: e.target.value })} className={input} /></div>
              <div><label className="text-xs font-medium text-slate-600">{t("Email")}</label><input type="email" name="email" autoComplete="off" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} className={input} /></div>
              <div><label className="text-xs font-medium text-slate-600">{t("Teléfono")}</label><input name="telefono" autoComplete="off" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} className={input} /></div>
              <div><label className="text-xs font-medium text-slate-600">{t("Nacionalidad")}</label><input name="nacionalidad" autoComplete="off" value={nuevo.nacionalidad} onChange={(e) => setNuevo({ ...nuevo, nacionalidad: e.target.value })} className={input} /></div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{t("Con el nombre basta: el resto de la ficha se completa luego, a mano o con la lectura de sus documentos.")}</p>
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={anadirTrabajador} disabled={guardando} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
                {guardando ? t("Guardando…") : t("Añadir")}
              </button>
              <button type="button" onClick={() => { setAnadiendo(false); setError(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Cancelar")}</button>
            </div>
          </div>
        )}
        {ficha.trabajadores.length === 0 ? (
          !anadiendo && <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500">{t("Sin trabajadores: la empresa es cliente directa.")}</p>
        ) : (
          <ul className="divide-y divide-slate-50 border-t border-slate-100">
            {ficha.trabajadores.map((tr) => (
              <li key={tr.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <Link href={`/app/clientes/${tr.id}`} className="text-sm font-medium text-slate-800 hover:underline">{tr.nombre}</Link>
                {tr.telefono && <span className="text-xs text-slate-400">{tr.telefono}</span>}
                <span className="flex flex-wrap gap-1.5">
                  {tr.expedientes.map((x) => (
                    <Link key={x.id} href={`/app/expedientes/${x.id}`} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 transition hover:border-slate-400">
                      {x.referencia} · {x.tipoLabel}
                    </Link>
                  ))}
                  {tr.expedientes.length === 0 && <span className="text-[11px] text-slate-400">{t("sin expedientes")}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Documentos: los de sus expedientes y trabajadores, y los de la empresa (25/09/2026). */}
      <DocumentosEmpresa empresaId={ficha.id} trabajadores={ficha.trabajadores.map((w) => ({ id: w.id, nombre: w.nombre }))} docs={documentos} subidaDisponible={subidaDocumentos} />

      {/* Lo facturado ANTES de Aproba (historial importado): no son facturas de Aproba. */}
      {ficha.historial.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Facturado antes de Aproba")} ({ficha.historial.length})</p>
            <p className="text-xs text-slate-500">
              {t("Total")} <span className="font-semibold text-slate-800">{eur(ficha.historialTotales.importe)}</span>
              {ficha.historialTotales.pendiente > 0 && <> · {t("pendiente de cobro")} <span className="font-semibold text-amber-600">{eur(ficha.historialTotales.pendiente)}</span></>}
            </p>
          </div>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-sm">
              <tbody>
                {ficha.historial.map((h) => (
                  <tr key={h.id} className="border-b border-slate-50 last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{h.fecha ? new Date(h.fecha).toLocaleDateString("es-ES", { timeZone: "UTC" }) : "—"}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {h.etiqueta}{h.referencia && <span className="ml-2 font-mono text-[11px] text-slate-400">{h.referencia}</span>}
                      {h.notas && <span className="block line-clamp-2 text-xs text-slate-400">{h.notas}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-slate-800">{h.importe != null ? eur(h.importe) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      {h.cobro === "PENDIENTE"
                        ? <div className="flex items-center justify-end gap-2"><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{t("Pendiente")}</span><MarcarCobroPrevio tipo="servicio" id={h.id} /></div>
                        : h.cobro && <span className="rounded-full bg-aproba-50 px-2 py-0.5 text-xs font-semibold text-aproba-700">{t("Cobrada")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Facturas emitidas a la empresa */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <p className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Facturas")} ({ficha.facturas.length})</p>
        {ficha.facturas.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500">{t("Todavía sin facturas.")}</p>
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-sm">
              <tbody>
                {ficha.facturas.map((f) => {
                  const meta = FACTURA_ESTADO_META[f.estado as FacturaEstado] ?? FACTURA_ESTADO_META.EMITIDA;
                  return (
                    <tr key={f.id} className="border-b border-slate-50 last:border-0 hover:bg-cream-50">
                      <td className="px-5 py-3"><Link href={`/app/facturas/${f.id}`} className="font-mono text-xs text-aproba-700 hover:underline">{f.numero}</Link></td>
                      <td className="hidden px-3 py-3 text-slate-500 sm:table-cell">{f.concepto}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-800">{eur(f.total)}</td>
                      <td className="px-5 py-3 text-right"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
