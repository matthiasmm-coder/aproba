import { fetchExpedientesParaDehu, fetchNotificacionesDehu } from "@/lib/data/notificaciones-dehu";
import { fetchDireccionRecepcion } from "@/lib/data/direccion-recepcion";
import { DehuBandeja } from "@/components/dehu-bandeja";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "DEHú" };
export const dynamic = "force-dynamic";

// PESTAÑA DEHú (28/09/2026): las notificaciones de la Administración, leídas por la IA y
// enlazadas a su expediente con el clic del gestor; y los avisos de la DEHú con los 10
// días naturales para abrirlas. Ver components/dehu-bandeja.tsx.
export default async function DehuPage() {
  const t = await getT();
  const [bandeja, expedientes, recepcion] = await Promise.all([
    fetchNotificacionesDehu(),
    fetchExpedientesParaDehu().catch(() => []),
    fetchDireccionRecepcion(),
  ]);
  const pendientes = bandeja.items.filter((n) => n.estado === "PENDIENTE" || n.estado === "VINCULADA").length;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Notificaciones de la DEHú")}</h1>
        <p className="text-sm text-slate-500">
          {pendientes > 0
            ? t("{n} por revisar").replace("{n}", String(pendientes))
            : t("Requerimientos, resoluciones y citaciones, leídos y enlazados a su expediente.")}
        </p>
      </div>
      <DehuBandeja items={bandeja.items} expedientes={expedientes} direccion={recepcion.direccion} faltaMigracion={bandeja.faltaMigracion} />
    </div>
  );
}
