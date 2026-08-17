import { SERVICIO_A_TIPO } from "@/lib/tramites";
import { notFound } from "next/navigation";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchSolicitantesDeFamilia } from "@/lib/data/familias";
import { formulariosDelTramite, formulariosDisponibles, P2_OPCIONES } from "@/lib/ex-forms";
import { fetchP2Overrides } from "@/lib/p2-overrides";
import { createSupabaseServer } from "@/lib/supabase/server";
import { FormulariosView } from "@/components/formularios-view";
import { camposQueFaltan, FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

export default async function FormulariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exp = await fetchExpedienteDetalle(id);
  if (!exp) notFound();

  // Multi-servicio: unión de los modelos del principal + extras.
  const oficiales = formulariosDelTramite(exp.tipoEnum, [exp.servicioClave, ...exp.serviciosExtra]);
  // Expediente familiar: un juego de formularios por solicitante (rellenado con sus datos).
  // p2Inicial: casilla p.2 forzada previamente (persistida) para inicializar el selector.
  const [applicants, p2Inicial] = await Promise.all([
    // Familia heterogénea: los solicitantes son los miembros CON servicio asignado.
    exp.familiaId ? fetchSolicitantesDeFamilia(exp.familiaId, exp.serviciosAsignacion ? [...new Set(Object.values(exp.serviciosAsignacion).flat())] : null) : Promise.resolve([]),
    createSupabaseServer().then((sb) => fetchP2Overrides(sb, id)),
  ]);
  // Selección inicial: si la lista ya fue CURADA (persistida, aunque esté vacía), ELLA es
  // la verdad — re-unir los defaults del trámite resucitaría un modelo quitado con la ×
  // de la ficha al primer clic de descarga (el POST guarda la selección completa).
  // Sin curar todavía → defaults del trámite.
  const iniciales = exp.formulariosCurados ? exp.formularios.map((f) => f.code) : oficiales;
  // Familia heterogénea: los modelos POR DEFECTO de cada miembro son los de SUS servicios
  // asignados (Fred arraigo ≠ Antoine reagrupación). Curado previo: se intersecta.
  const asig = exp.serviciosAsignacion;
  const oficialesPorMiembro = Object.fromEntries(applicants.map((a) => {
    const claves = asig
      ? Object.entries(asig).filter(([, ids]) => ids.includes(a.id)).map(([k]) => k)
      : [exp.servicioClave, ...exp.serviciosExtra];
    // Cada clave resuelve con SU tipo (no el del expediente): si no, el miembro de la
    // renovación heredaría los EX del arraigo por el repli del slot principal.
    const modelos = [...new Set((claves.filter(Boolean) as string[]).flatMap((c) => formulariosDelTramite(SERVICIO_A_TIPO[c] ?? exp.tipoEnum, [c])))];
    return [a.id, exp.formulariosPorMiembro?.[a.id] ?? (exp.formulariosCurados ? modelos.filter((m) => iniciales.includes(m)) : modelos)];
  }));

  // AVISO de datos que faltan: el PDF oficial se generaba INCOMPLETO en silencio
  // (17/08/2026 — «no marca el estado civil», con ese campo vacío en la ficha).
  // Individual: la ficha del titular. Familia: la de cada solicitante.
  let faltanPorPersona: { id: string; nombre: string; campos: string[] }[] = [];
  if (applicants.length) {
    const sb = await createSupabaseServer();
    const { data: fichas } = await sb.from("Cliente").select(FICHA_KEYS.join(", ")).in("id", applicants.map((a) => a.id));
    const porId = Object.fromEntries(((fichas ?? []) as unknown as (ClienteFicha & { id?: string })[]).map((f, i) => [applicants[i]?.id ?? String(i), f]));
    faltanPorPersona = applicants
      .map((a) => ({ id: a.id, nombre: a.nombre, campos: camposQueFaltan(porId[a.id]) }))
      .filter((x) => x.campos.length);
  } else {
    const campos = camposQueFaltan(exp.clienteFicha);
    if (campos.length) faltanPorPersona = [{ id: exp.clienteId ?? "titular", nombre: exp.clienteNombre, campos }];
  }

  return <FormulariosView faltanPorPersona={faltanPorPersona} exp={exp} oficiales={iniciales} oficialesPorMiembro={oficialesPorMiembro} todos={formulariosDisponibles()} applicants={applicants} p2Opciones={P2_OPCIONES} p2Inicial={p2Inicial} />;
}
