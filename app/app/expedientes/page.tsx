import { fetchExpedientesResumen } from "@/lib/data/expedientes";
import { BoardClient, type BoardItem } from "@/components/board-client";

export const metadata = { title: "Expedientes" };

// Board branché sur Supabase (RLS) : chaque gestor ne voit que son workspace.
export default async function Board() {
  const expedientes = await fetchExpedientesResumen();

  const items: BoardItem[] = expedientes.map((e) => ({
    id: e.id,
    referencia: e.referencia,
    clienteNombre: e.clienteNombre,
    clienteNacionalidad: e.clienteNacionalidad,
    tipoLabel: e.tipoLabel,
    estado: e.estado,
    asignadoA: e.asignadoA,
    fechaLimite: e.fechaLimite,
    validados: e.validados,
    total: e.total,
  }));

  const asignados = [...new Set(items.map((e) => e.asignadoA))].sort();

  return (
    <div>
      <BoardClient items={items} asignados={asignados} />
    </div>
  );
}
