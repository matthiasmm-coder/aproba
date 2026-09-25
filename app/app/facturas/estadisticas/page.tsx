import { getT } from "@/lib/app-lang";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { PastillasOficina } from "@/components/pastillas-oficina";
import { fetchMovimientosFacturacion, type MovimientosFacturacion } from "@/lib/data/estadisticas-facturacion";
import { calcularEstadisticas, periodoDeParams } from "@/lib/estadisticas-facturacion";
import { EstadisticasVista } from "@/components/estadisticas-vista";

export const metadata = { title: "Estadísticas de facturación" };

// FACTURAS › ESTADÍSTICAS (Luis, Asenjo, 25/09/2026): la facturación de un vistazo —
// emitidas frente a recibidas, por mes y por trimestre, con curvas, los principales
// clientes y proveedores, y el informe descargable (PDF y Excel). El cálculo vive en
// lib/estadisticas-facturacion.ts (puro, probado); la pantalla, en components/estadisticas-vista.

export default async function EstadisticasFacturacion({ searchParams }: { searchParams: Promise<{ anio?: string; t?: string }> }) {
  const sp = await searchParams;
  const t = await getT();
  const periodo = periodoDeParams(sp.anio, sp.t, new Date().getUTCFullYear());
  const filtroSede = await resolverOficina().catch(() => ({ activa: null, oficinas: [], miOficina: null, autoId: null, sedes: null, incluirSinSede: false }));
  let mov: MovimientosFacturacion = { emitidas: [], recibidas: [], sinFecha: { emitidas: 0, recibidas: 0 } };
  let error: string | null = null;
  try { mov = await fetchMovimientosFacturacion(filtroSede.sedes, filtroSede.incluirSinSede); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const est = calcularEstadisticas(mov.emitidas, mov.recibidas, periodo, { hoy: new Date().toISOString().slice(0, 10) });
  return (
    <>
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      <EstadisticasVista est={est} periodo={periodo} sinFechaRecibidas={mov.sinFecha.recibidas} error={error} t={t} />
    </>
  );
}
