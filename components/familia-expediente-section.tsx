import { parentescoLabel } from "@/lib/familia";
import { FacturarFamilia } from "@/components/facturar-familia";
import type { FamiliaDetalle } from "@/lib/data/familias";
import type { FacturaFamiliaPrefill, FacturaFamiliaResumen } from "@/lib/data/familias";

// Vista gestor de la FAMILIA de un expediente familiar: miembros (con parentesco) +
// facturación familiar. Se muestra en la ficha del expediente (Expediente.familiaId).
export function FamiliaExpedienteSection({
  familia, solicitanteNombre, prefill, facturas,
}: {
  familia: FamiliaDetalle; solicitanteNombre: string; prefill: FacturaFamiliaPrefill | null; facturas: FacturaFamiliaResumen[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <svg className="h-4 w-4 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>
        <h2 className="text-sm font-semibold text-slate-700">{familia.nombre} · {familia.miembros.length} {familia.miembros.length === 1 ? "miembro" : "miembros"}</h2>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <ul className="divide-y divide-slate-100">
          {familia.miembros.map((m) => {
            const esSolicitante = m.nombre === solicitanteNombre;
            return (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="inline-block rounded-full bg-cream-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{parentescoLabel(m.parentesco) || "Miembro"}</span>
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">{m.nombre}</span>
                  {m.telefono && <span className="hidden truncate text-xs text-slate-400 sm:inline">{m.telefono}</span>}
                </div>
                {esSolicitante && <span className="shrink-0 rounded-full bg-aproba-100 px-2 py-0.5 text-[10px] font-semibold text-aproba-700">Solicitante</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <FacturarFamilia familiaId={familia.id} prefill={prefill} facturas={facturas} />
    </section>
  );
}
