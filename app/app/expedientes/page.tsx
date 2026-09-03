import { fetchExpedientesResumen, TOPE_EXPEDIENTES } from "@/lib/data/expedientes";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PastillasOficina } from "@/components/pastillas-oficina";
import { BoardClient, type BoardItem } from "@/components/board-client";

export const metadata = { title: "Expedientes" };

// Board branché sur Supabase (RLS) : chaque gestor ne voit que son workspace.
export default async function Board({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro } = await searchParams;
  const filtroSede = await resolverOficina();
  const expedientes = await fetchExpedientesResumen(filtroSede.sedes, filtroSede.incluirSinSede, TOPE_EXPEDIENTES);

  // FLUJO v4: dos lecturas ligeras aparte del cargador (que tiene su propia cadena de
  // replis y no debe depender de columnas nuevas): (1) ¿tiene factura viva? — el chip
  // «Facturado / Sin facturar» de la columna Preparado; (2) la SALIDA de los archivados
  // (columna opcional hasta la migración supabase/flujo-v4.sql: si falta, se deduce del
  // estado en el cliente). Ambas bajo RLS.
  const supabase = await createSupabaseServer();
  const ids = expedientes.map((e) => e.id);
  const facturados = new Set<string>();
  const salidas = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const { data: fs } = await supabase.from("Factura").select("expedienteId").in("expedienteId", lote).in("estado", ["EMITIDA", "VENCIDA", "PAGADA"]);
    for (const f of fs ?? []) if (f.expedienteId) facturados.add(f.expedienteId);
    const { data: ss } = await supabase.from("Expediente").select("id, salida").in("id", lote);
    for (const s of ss ?? []) salidas.set(s.id, (s as { salida?: string | null }).salida ?? null);
  }

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
    presentadoEl: e.presentadoEl,
    archivado: e.archivado,
    salida: salidas.get(e.id) ?? null,
    validados: e.validados,
    total: e.total,
    // ⚠️ Si añades un campo a BoardItem, pásalo aquí: nadie te avisará.
    progreso: e.progreso,
    cobro: { facturado: facturados.has(e.id) },
  }));

  const asignados = [...new Set(items.map((e) => e.asignadoA))].sort();

  return (
    // Mismo ancho que Inicio (dashboard-client): con dos columnas, el tablero no
    // necesita todo el ancho (pedido de Matthias, 03/09).
    <div className="mx-auto max-w-5xl">
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      {expedientes.length >= TOPE_EXPEDIENTES && (
        <p className="mb-3 text-center text-xs text-slate-400">Mostrando los {TOPE_EXPEDIENTES} expedientes más recientes. Usa el buscador para encontrar los demás.</p>
      )}
      <BoardClient items={items} asignados={asignados} filtroInicial={filtro === "esperando" ? "esperando" : null} />
    </div>
  );
}
