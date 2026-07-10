import { FacturarFamilia } from "@/components/facturar-familia";
import { MiembrosFamiliaGestor } from "@/components/miembros-familia-gestor";
import type { FamiliaDetalle } from "@/lib/data/familias";
import type { FacturaFamiliaPrefill, FacturaFamiliaResumen } from "@/lib/data/familias";

// Vista gestor de la FAMILIA de un expediente familiar: gestión de miembros (añadir,
// parentesco, solicitantes, editar ficha) + facturación familiar. En la ficha del
// expediente (Expediente.familiaId). El titular = el miembro ancla de ESTE expediente.
export function FamiliaExpedienteSection({
  familia, expedienteId, prefill, facturas,
}: {
  familia: FamiliaDetalle; expedienteId: string; prefill: FacturaFamiliaPrefill | null; facturas: FacturaFamiliaResumen[];
}) {
  const titularId = familia.miembros.find((m) => m.expedientes.some((e) => e.id === expedienteId))?.id ?? null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <svg className="h-4 w-4 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>
        <h2 className="text-sm font-semibold text-slate-700">{familia.nombre} · {familia.miembros.length} {familia.miembros.length === 1 ? "miembro" : "miembros"}</h2>
      </div>

      <MiembrosFamiliaGestor familiaId={familia.id} titularId={titularId} miembros={familia.miembros} />

      <FacturarFamilia familiaId={familia.id} prefill={prefill} facturas={facturas} />
    </section>
  );
}
