import Link from "next/link";
import { fetchRequerimientosPendientes } from "@/lib/data/requerimientos";
import { fetchHistorialResumen } from "@/lib/data/historial";
import { totalResumen } from "@/lib/historial-arbol";
import { fetchVencimientos } from "@/lib/data/vencimientos";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { PastillasOficina } from "@/components/pastillas-oficina";
import { VistasExpedientes } from "@/components/vistas-expedientes";
import { urgenciaDe, plazoClave, diasRestantes } from "@/lib/requerimientos";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Requerimientos" };
export const dynamic = "force-dynamic";

// REQUERIMIENTOS — cuarta vista de Expedientes (petición de Jennifer, Gesadmbcn,
// 21/09/2026): todos los plazos abiertos del despacho, el más urgente arriba.
// Se anotan y se cierran desde la ficha del expediente: aquí se VEN todos juntos,
// que es justo lo que pedía («un apartado de requerimientos»).
export default async function RequerimientosPage() {
  const t = await getT();
  const filtroSede = await resolverOficina();
  const [pendientes, resumenArchivo, vencimientos] = await Promise.all([
    fetchRequerimientosPendientes(filtroSede.sedes, filtroSede.incluirSinSede),
    fetchHistorialResumen(filtroSede.sedes, filtroSede.incluirSinSede).catch(() => null),
    fetchVencimientos(filtroSede.sedes, filtroSede.incluirSinSede).catch(() => []),
  ]);

  const urgentes = pendientes.filter((r) => diasRestantes(r.fechaLimite) <= 0).length;
  const caducanPronto = vencimientos.filter((v) => v.estado !== "TRAMITANDO" && v.dias <= 60).length;

  const COLOR: Record<string, string> = {
    VENCIDO: "border-red-300 bg-red-50",
    HOY: "border-red-300 bg-red-50",
    URGENTE: "border-amber-300 bg-amber-50",
    PROXIMO: "border-amber-200 bg-amber-50/60",
    TRANQUILO: "border-slate-200 bg-white",
    APORTADO: "border-slate-200 bg-slate-50",
  };
  const TEXTO: Record<string, string> = {
    VENCIDO: "text-red-700", HOY: "text-red-700", URGENTE: "text-amber-800",
    PROXIMO: "text-amber-700", TRANQUILO: "text-slate-600", APORTADO: "text-slate-500",
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Expedientes")}</h1>
          <p className="text-sm text-slate-500">
            {pendientes.length === 0
              ? t("Ningún requerimiento pendiente")
              : `${pendientes.length} ${pendientes.length === 1 ? t("requerimiento por aportar") : t("requerimientos por aportar")}${urgentes > 0 ? ` · ${urgentes} ${t("vencen hoy o ya vencieron")}` : ""}`}
          </p>
        </div>
        <VistasExpedientes
          activa="requerimientos"
          totalHistorial={resumenArchivo ? totalResumen(resumenArchivo) : 0}
          totalRenovaciones={caducanPronto}
          totalRequerimientos={pendientes.length}
          requerimientosUrgentes={urgentes > 0}
        />
      </div>

      {pendientes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">{t("Ningún requerimiento pendiente")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {t("Cuando la Administración te pida algo con plazo, anótalo en la ficha del expediente: aparecerá aquí y Aproba te avisará antes de que venza.")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {pendientes.map((r) => {
            const u = urgenciaDe(r);
            return (
              <li key={r.id}>
                <Link href={`/app/expedientes/${r.expedienteId}#requerimientos`} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition hover:border-slate-400 ${COLOR[u]}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.clienteNombre}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-600">{r.asunto}</p>
                    {r.referencia && <p className="mt-0.5 font-mono text-[11px] text-slate-400">{r.referencia}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${TEXTO[u]}`}>{(() => { const p = plazoClave(r); return t(p.clave).replace("{n}", String(p.n)); })()}</p>
                    <p className="text-[11px] text-slate-500">{new Date(r.fechaLimite).toLocaleDateString("es-ES")}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
