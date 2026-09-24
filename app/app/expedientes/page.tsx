import { fetchExpedientesResumen, TOPE_EXPEDIENTES } from "@/lib/data/expedientes";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { TIPO_A_SERVICIO } from "@/lib/tramites";
import { temaEfectivo, unificarTemas } from "@/lib/temas";
import { fetchHistorialResumen } from "@/lib/data/historial";
import { fetchRenovacionesPropuestas, fetchVencimientos } from "@/lib/data/vencimientos";
import { fetchRequerimientosPendientes } from "@/lib/data/requerimientos";
import { diasRestantes } from "@/lib/requerimientos";
import { fetchAvataresEquipo } from "@/lib/data/equipo";
import { TIPO_LABEL } from "@/lib/tramites";
import { normTema } from "@/lib/servicios";
import { catalogoDeSede } from "@/lib/multi-servicio";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PastillasOficina } from "@/components/pastillas-oficina";
import { BoardClient, type BoardItem } from "@/components/board-client";
import { ExpedientesLista, type ItemLista, type PackLite } from "@/components/expedientes-lista";

export const metadata = { title: "Expedientes" };

// Board branché sur Supabase (RLS) : chaque gestor ne voit que son workspace.
export default async function Board({ searchParams }: { searchParams: Promise<{ filtro?: string; vista?: string }> }) {
  const { filtro, vista } = await searchParams;
  const filtroSede = await resolverOficina();
  // EL ARCHIVO SE LEE APARTE (supabase/historial-resumen.sql): recuentos por servicio y
  // año. Si la función existe, el cargador ya NO trae los archivados — es lo que permite
  // importar quince años sin que la pantalla cargue quince años.
  const [resumenArchivo, avatares, vencimientos] = await Promise.all([
    fetchHistorialResumen(filtroSede.sedes, filtroSede.incluirSinSede),
    fetchAvataresEquipo(),
    fetchVencimientos(filtroSede.sedes, filtroSede.incluirSinSede).catch(() => []), // pestaña «Renovaciones»
  ]);
  // El recuento de la pestaña = el KPI «Caducan pronto» del Inicio (misma regla).
  const renovaciones = vencimientos.filter((v) => v.estado !== "TRAMITANDO" && v.dias <= 60).length;
  const [cargados, propuestas, requerimientos] = await Promise.all([
    fetchExpedientesResumen(filtroSede.sedes, filtroSede.incluirSinSede, TOPE_EXPEDIENTES, resumenArchivo !== null),
    fetchRenovacionesPropuestas(),
    fetchRequerimientosPendientes(filtroSede.sedes, filtroSede.incluirSinSede).catch(() => []), // pestaña «Requerimientos»
  ]);
  // Requerimientos vivos del despacho: contador de la pestaña, en rojo si alguno vence hoy o ya venció.
  const requerimientosUrgentes = requerimientos.filter((r) => diasRestantes(r.fechaLimite) <= 0).length;
  // Una renovación PROPUESTA y sin respuesta no es todavía trabajo en curso: vive en la
  // vista Renovaciones («Esperando respuesta») y entra aquí cuando el cliente acepta.
  const expedientes = cargados.filter((e) => !propuestas.has(e.id));

  // FLUJO v4: dos lecturas ligeras aparte del cargador (que tiene su propia cadena de
  // replis y no debe depender de columnas nuevas): (1) ¿tiene factura viva? — el chip
  // «Facturado / Sin facturar» de la columna Preparado; (2) la SALIDA de los archivados
  // (columna opcional hasta la migración supabase/flujo-v4.sql: si falta, se deduce del
  // estado en el cliente). Ambas bajo RLS.
  const supabase = await createSupabaseServer();
  const ids = expedientes.map((e) => e.id);
  const facturados = new Set<string>();
  const salidas = new Map<string, string | null>();
  // Servicio del expediente → para agrupar el ARCHIVO por TEMA, como sus carpetas.
  const servicioDeExp = new Map<string, string | null>();
  const tipoDeExp = new Map<string, string>();
  const extrasDeExp = new Map<string, string[]>();
  const anioDeExp = new Map<string, string>();
  // Sede del expediente: decide QUÉ catálogo lo nombra (multi-oficina).
  const oficinaDeExp = new Map<string, string | null>(
    (expedientes as unknown as { id: string; oficinaId?: string | null }[]).map((e) => [e.id, e.oficinaId ?? null]),
  );
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const { data: fs } = await supabase.from("Factura").select("expedienteId").in("expedienteId", lote).in("estado", ["EMITIDA", "VENCIDA", "PAGADA"]);
    for (const f of fs ?? []) if (f.expedienteId) facturados.add(f.expedienteId);
    let ss = await supabase.from("Expediente").select("id, salida, servicioClave, serviciosExtra, tipo, archivadoAt, createdAt").in("id", lote);
    if (ss.error) ss = await supabase.from("Expediente").select("id, salida, servicioClave, tipo, createdAt").in("id", lote) as typeof ss;
    if (ss.error) ss = await supabase.from("Expediente").select("id, salida, tipo").in("id", lote) as typeof ss;
    for (const s of ss.data ?? []) {
      const x = s as { id: string; salida?: string | null; servicioClave?: string | null; serviciosExtra?: string[] | null; tipo?: string | null; archivadoAt?: string | null; createdAt?: string | null };
      salidas.set(x.id, x.salida ?? null);
      servicioDeExp.set(x.id, x.servicioClave ?? null);
      if (Array.isArray(x.serviciosExtra)) extrasDeExp.set(x.id, x.serviciosExtra.filter(Boolean));
      if (x.tipo) tipoDeExp.set(x.id, x.tipo);
      // Año del ARCHIVO: cuándo se cerró. Sin esa columna, cuándo se abrió — nunca se
      // inventa una fecha: sin ninguna, el expediente cae en «Sin fecha».
      const iso = x.archivadoAt || x.createdAt || "";
      if (/^\d{4}/.test(iso)) anioDeExp.set(x.id, iso.slice(0, 4));
    }
  }

  // Catálogo del despacho: las FILAS, sin aplanar. Con varias sedes, la misma clave
  // existe en cada una (Jennifer: 14 duplicadas) y un mapa plano clave→tema elegía un
  // ganador al azar; se resuelve por la sede del expediente, como en la ficha y el portal.
  type FilaCat = { clave: string; label: string; categoria: string | null; temaId: string | null; oficinaId: string | null };
  let filasCatalogo: FilaCat[] = [];
  try {
    let cs = await supabase.from("ServicioConfig").select("clave, label, categoria, temaId, oficinaId, orden").order("orden");
    if (cs.error) cs = await supabase.from("ServicioConfig").select("clave, label, categoria, oficinaId, orden").order("orden") as typeof cs;
    if (cs.error) cs = await supabase.from("ServicioConfig").select("clave, label, oficinaId").order("orden") as typeof cs;
    filasCatalogo = (cs.data ?? []).map((c) => {
      const x = c as { clave: string; label?: string | null; categoria?: string | null; temaId?: string | null; oficinaId?: string | null };
      return { clave: x.clave, label: (x.label ?? "").trim() || x.clave, categoria: (x.categoria ?? "").trim() || null, temaId: x.temaId ?? null, oficinaId: x.oficinaId ?? null };
    });
  } catch { /* sin catálogo: el árbol se agrupa por servicio, sin temas */ }

  // Tema EFECTIVO de cada fila: el que escribió el despacho o, si no tocó Ajustes, el
  // propuesto por la clave/el nombre. Sin esto, un despacho como el de Juan (40
  // servicios, 0 temas) abría la pantalla con 18 carpetas raíz.
  // Carpetas del catálogo (Workspace.temas). Con ellas, la carpeta manda sobre cualquier
  // tema deducido, y las que hoy no tienen expedientes se siguen viendo.
  let carpetasWs: { id: string; nombre: string; parentId: string | null }[] = [];
  let packs: PackLite[] = [];
  try {
    const { data: mem } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
    const wsId = (mem as { workspaceId?: string } | null)?.workspaceId;
    if (wsId) {
      const { data: wsTemas } = await supabase.from("Workspace").select("temas").eq("id", wsId).maybeSingle();
      const rawT = (wsTemas as { temas?: unknown } | null)?.temas;
      if (Array.isArray(rawT)) {
        carpetasWs = (rawT as { id?: string; nombre?: string; parentId?: string | null }[])
          .map((c) => ({ id: String(c.id ?? ""), nombre: String(c.nombre ?? "").trim(), parentId: c.parentId ? String(c.parentId) : null }))
          .filter((c) => c.id && c.nombre);
      }
      const { data: ws } = await supabase.from("Workspace").select("packs").eq("id", wsId).maybeSingle();
      const raw = (ws as { packs?: unknown } | null)?.packs;
      if (Array.isArray(raw)) {
        packs = (raw as { id?: string; nombre?: string; servicioIds?: string[] }[])
          .filter((p) => p?.id && p?.nombre && Array.isArray(p.servicioIds) && p.servicioIds.length > 0)
          .map((p) => ({ id: String(p.id), nombre: String(p.nombre), servicioIds: p.servicioIds as string[] }));
      }
    }
  } catch { /* sin packs: el segundo nivel es el servicio */ }

  const hayCarpetas = carpetasWs.length > 0;
  // La carpeta RAÍZ de un servicio: una subcarpeta no es una carpeta hermana, está
  // dentro de la suya, así que sus expedientes cuentan en la madre.
  const raizDeCarpeta = (temaId: string | null): string | null => {
    const c = carpetasWs.find((x) => x.id === temaId);
    if (!c) return null;
    const madre = c.parentId ? carpetasWs.find((x) => x.id === c.parentId) : null;
    return (madre ?? c).nombre;
  };
  const temaDeFila = (f: FilaCat) => raizDeCarpeta(f.temaId) ?? temaEfectivo(f.categoria, f.clave, f.label, hayCarpetas);
  // Orden de los temas = orden del catálogo (el arrastre de Ajustes ordena el árbol), y
  // una sola grafía por tema: «ARRAIGO» y «Arraigo» son la misma carpeta.
  const { lista: temas, canon: canonTema } = unificarTemas(filasCatalogo.map(temaDeFila));
  const temaCanonico = (t: string | null) => (t ? canonTema.get(normTema(t)) ?? t : null);

  // Packs del despacho: si un expediente lleva TODOS los servicios de un pack, el árbol
  // lo agrupa bajo el nombre del pack — es como lo vendieron y como lo archivan.

  const items: BoardItem[] = expedientes.map((e) => ({
    id: e.id,
    referencia: e.referencia,
    clienteNombre: e.clienteNombre,
    clienteNacionalidad: e.clienteNacionalidad,
    empresaNombre: e.empresaNombre ?? null, // cliente-empresa: la tarjeta enseña quién contrata
    nTrabajadores: e.nTrabajadores ?? null, // expediente DE EMPRESA: trabajadores del lote
    tipoLabel: e.tipoLabel,
    extrasLabels: e.extrasLabels,
    estado: e.estado,
    asignadoA: e.asignadoA,
    fechaLimite: e.fechaLimite,
    presentadoEl: e.presentadoEl,
    numeroOficial: e.numeroOficial ?? null, // la fila lo enseña y lo edita (Jennifer, 24/09)
    archivado: e.archivado,
    salida: salidas.get(e.id) ?? null,
    validados: e.validados,
    total: e.total,
    // ⚠️ Si añades un campo a BoardItem, pásalo aquí: nadie te avisará.
    progreso: e.progreso,
    cobro: { facturado: facturados.has(e.id) },
  }));

  const asignados = [...new Set(items.map((e) => e.asignadoA))].sort();

  // Vista NUEVA (lista de trabajo + archivo por temas) por defecto; `?vista=tablero`
  // devuelve el tablero de dos columnas mientras se compara. 18/09/2026, en pruebas.
  const itemsLista: ItemLista[] = items.map((e) => {
    // Los expedientes ANTIGUOS (y los importados) no tienen servicioClave: se deduce del
    // tipo, si no todo su historial caería en «Sin tema» — justo lo que Luis y Marta
    // quieren recorrer por carpetas.
    const clave = servicioDeExp.get(e.id) || TIPO_A_SERVICIO[tipoDeExp.get(e.id) ?? ""] || null;
    const deSede = catalogoDeSede(filasCatalogo, oficinaDeExp.get(e.id) ?? null);
    const fila = clave ? deSede.find((f) => f.clave === clave) : undefined;
    const cat = fila ? { label: fila.label, tema: temaCanonico(temaDeFila(fila)) } : undefined;
    const claves = [clave, ...(extrasDeExp.get(e.id) ?? [])].filter((x): x is string => Boolean(x));
    // El año sale del cierre; si el expediente se presentó, su fecha manda (es la que
    // recuerda el gestor: «la nacionalidad de 2023»).
    const anio = (e.presentadoEl?.slice(-4) || anioDeExp.get(e.id)) ?? null;
    return { ...e, tema: cat?.tema ?? null, servicioLabel: cat?.label ?? e.tipoLabel, claves, anio };
  });

  // TODAS las carpetas raíz de Ajustes. Cada vista pinta las que le falten (el árbol no
  // duplica las que ya tienen expedientes): así «En curso» y el historial enseñan las
  // mismas carpetas, aunque una esté vacía en una de las dos.
  const carpetasRaiz = [...new Set(carpetasWs.filter((c) => !c.parentId).map((c) => c.nombre))]
    .map((n) => temaCanonico(n) ?? n);

  // Catálogo que nombra las carpetas del archivo: el de la sede MIRADA (la pastilla).
  const archivo = resumenArchivo
    ? {
        resumen: resumenArchivo,
        catalogo: catalogoDeSede(filasCatalogo, filtroSede.activa).map((f) => ({
          clave: f.clave, label: f.label, tema: temaCanonico(temaDeFila(f)),
        })),
        etiquetasTipo: TIPO_LABEL,
      }
    : null;

  return (
    // Mismo ancho que Inicio (dashboard-client): con dos columnas, el tablero no
    // necesita todo el ancho (pedido de Matthias, 03/09).
    <div className="mx-auto max-w-5xl">
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      {expedientes.length >= TOPE_EXPEDIENTES && (
        <p className="mb-3 text-center text-xs text-slate-400">Mostrando los {TOPE_EXPEDIENTES} expedientes más recientes. Los más antiguos todavía no aparecen aquí.</p>
      )}
      {vista === "tablero"
        ? <BoardClient items={items} asignados={asignados} filtroInicial={filtro === "esperando" ? "esperando" : null} avatares={avatares} />
        : <ExpedientesLista items={itemsLista} asignados={asignados} temas={temas} packs={packs} carpetasVacias={carpetasRaiz} filtroInicial={filtro === "esperando" ? "esperando" : null} vistaInicial={vista === "historial" ? "historial" : "curso"} renovaciones={renovaciones} requerimientos={requerimientos.length} requerimientosUrgentes={requerimientosUrgentes > 0} archivo={archivo} avatares={avatares} />}
    </div>
  );
}
