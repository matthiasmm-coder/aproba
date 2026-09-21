import { fetchVencimientos } from "@/lib/data/vencimientos";
import { fetchRequerimientosPendientes } from "@/lib/data/requerimientos";
import { diasRestantes } from "@/lib/requerimientos";
import { fetchHistorialResumen } from "@/lib/data/historial";
import { totalResumen } from "@/lib/historial-arbol";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { PastillasOficina } from "@/components/pastillas-oficina";
import { VencimientosList } from "@/components/vencimientos-list";
import { VistasExpedientes } from "@/components/vistas-expedientes";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Renovaciones" };
export const dynamic = "force-dynamic";

// VIGÍA — radar de renovaciones: qué tarjetas caducan, cuándo, y el botón «Proponer
// renovación» que convierte cada caducidad en un expediente nuevo. Desde el 20/09 es la
// tercera vista de Expedientes (En curso · Historial · Renovaciones): misma cabecera,
// misma ruta de siempre (/app/vencimientos), mismos datos.
export default async function VencimientosPage() {
  const t = await getT();
  const filtroSede = await resolverOficina();
  const [vencimientos, resumenArchivo, requerimientos] = await Promise.all([
    fetchVencimientos(filtroSede.sedes, filtroSede.incluirSinSede),
    fetchHistorialResumen(filtroSede.sedes, filtroSede.incluirSinSede).catch(() => null),
    fetchRequerimientosPendientes(filtroSede.sedes, filtroSede.incluirSinSede).catch(() => []),
  ]);
  // Mismos números que el KPI «Caducan pronto» del Inicio.
  const proximos = vencimientos.filter((v) => v.estado !== "TRAMITANDO");
  const caducanPronto = proximos.filter((v) => v.dias <= 60).length;
  const caducadas = proximos.filter((v) => v.dias < 0).length;
  return (
    <div className="mx-auto max-w-5xl">
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Expedientes")}</h1>
          <p className="text-sm text-slate-500">
            {caducanPronto > 0
              ? `${caducanPronto} ${t("caducan en 60 días")}${caducadas > 0 ? ` · ${caducadas} ${t("ya caducadas")}` : ""}`
              : t("Nada caduca en los próximos 60 días")}
          </p>
        </div>
        <VistasExpedientes activa="renovaciones" totalHistorial={resumenArchivo ? totalResumen(resumenArchivo) : 0} totalRenovaciones={caducanPronto}
          totalRequerimientos={requerimientos.length} requerimientosUrgentes={requerimientos.some((r) => diasRestantes(r.fechaLimite) <= 0)} />
      </div>
      <p className="text-sm text-slate-500">{t("Las tarjetas de tus clientes que caducan pronto. Inicia la renovación con un clic: se crea el expediente y se avisa al cliente en su idioma.")}</p>
      <VencimientosList vencimientos={vencimientos} />
    </div>
  );
}
