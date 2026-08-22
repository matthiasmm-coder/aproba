import { fetchExpedientesResumen, TOPE_EXPEDIENTES } from "@/lib/data/expedientes";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { PastillasOficina } from "@/components/pastillas-oficina";
import { BoardClient, type BoardItem } from "@/components/board-client";

export const metadata = { title: "Expedientes" };

// Board branché sur Supabase (RLS) : chaque gestor ne voit que son workspace.
export default async function Board({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro } = await searchParams;
  const filtroSede = await resolverOficina();
  const expedientes = await fetchExpedientesResumen(filtroSede.sedes, filtroSede.incluirSinSede, TOPE_EXPEDIENTES);

  const items: BoardItem[] = expedientes.map((e) => ({
    id: e.id,
    referencia: e.referencia,
    clienteNombre: e.clienteNombre,
    clienteNacionalidad: e.clienteNacionalidad,
    tipoLabel: e.tipoLabel,
    extrasLabels: e.extrasLabels,
    estado: e.estado,
    asignadoA: e.asignadoA,
    fechaLimite: e.fechaLimite,
    archivado: e.archivado,
    validados: e.validados,
    total: e.total,
    // ⚠️ Este mapping TIRABA `progreso` (y extrasLabels): el tablero real llevaba desde
    // la reforma corriendo sobre los replis por estado — fases y acciones correctas de
    // casualidad, orden y «esperando cliente» degradados, y la puesta al día en lote
    // ciega. Si añades un campo a BoardItem, pásalo aquí: nadie te avisará.
    progreso: e.progreso,
  }));

  const asignados = [...new Set(items.map((e) => e.asignadoA))].sort();

  return (
    <div>
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      {expedientes.length >= TOPE_EXPEDIENTES && (
        <p className="mb-3 text-center text-xs text-slate-400">Mostrando los {TOPE_EXPEDIENTES} expedientes más recientes. Usa el buscador para encontrar los demás.</p>
      )}
      <BoardClient items={items} asignados={asignados} filtroInicial={filtro === "esperando" ? "esperando" : null} />
    </div>
  );
}
