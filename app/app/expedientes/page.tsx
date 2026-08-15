import { fetchExpedientesResumen } from "@/lib/data/expedientes";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { PastillasOficina } from "@/components/pastillas-oficina";
import { BoardClient, type BoardItem } from "@/components/board-client";

export const metadata = { title: "Expedientes" };

// Board branché sur Supabase (RLS) : chaque gestor ne voit que son workspace.
export default async function Board({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro } = await searchParams;
  const filtroSede = await resolverOficina();
  const expedientes = await fetchExpedientesResumen(filtroSede.sedes, filtroSede.incluirSinSede);

  const items: BoardItem[] = expedientes.map((e) => ({
    id: e.id,
    referencia: e.referencia,
    clienteNombre: e.clienteNombre,
    clienteNacionalidad: e.clienteNacionalidad,
    tipoLabel: e.tipoLabel,
    estado: e.estado,
    asignadoA: e.asignadoA,
    fechaLimite: e.fechaLimite,
    archivado: e.archivado,
    validados: e.validados,
    total: e.total,
  }));

  const asignados = [...new Set(items.map((e) => e.asignadoA))].sort();

  return (
    <div>
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      <BoardClient items={items} asignados={asignados} filtroInicial={filtro === "esperando" ? "esperando" : null} />
    </div>
  );
}
