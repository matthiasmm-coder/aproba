// MEMORIA DE ACTIVIDAD — artículo 8.1.f de la Orden ISM/164/2026.
//
// Las entidades inscritas en el Registro Electrónico de Colaboradores de Extranjería
// deben aportar, al pedir la prórroga de su inscripción, «una auditoría externa o
// memoria de actividad que evalúe el impacto que ha tenido su acción, reflejando el
// número de expedientes tramitados, describiendo los procedimientos en los que la
// entidad haya intervenido, el tipo de actuaciones realizadas, los recursos empleados
// y cualquier otro elemento que permita valorar la calidad, alcance y eficacia».
// Las cinco secciones de abajo son ESA frase, en ese orden.
//
// Regla de diseño: la memoria es AGREGADA. No lleva ni un nombre, ni un NIE, ni una
// referencia de expediente — es un documento que sale del despacho hacia la
// Administración, y el artículo pide impacto, no un listado de personas.
//
// Módulo puro (sin I/O): la consulta vive en lib/data/memoria.ts y el PDF en
// lib/memoria-pdf.ts, para que el cálculo se pueda probar sin base de datos.

import { TIPO_A_SERVICIO, TIPO_LABEL } from "@/lib/tramites";

export type FilaExpediente = {
  id: string;
  createdAt: string;
  tipo: string;
  servicioClave?: string | null;
  estado: string;
  /** flujo v4: en_tramite | concedido | denegado | desistido (null si la migración falta) */
  salida?: string | null;
  fechaPresentacion?: string | null;
  clienteId: string;
  oficinaId?: string | null;
  nacionalidad?: string | null;
};

export type FilaEvento = { expedienteId: string; tipo: string; createdAt: string };

export type EntradaMemoria = {
  desde: string; // AAAA-MM-DD, incluido
  hasta: string; // AAAA-MM-DD, incluido
  expedientes: FilaExpediente[];
  eventos: FilaEvento[];
  /** clave de ServicioConfig → etiqueta configurada por el despacho */
  servicios: Record<string, string>;
  /** miembros del workspace, por rol (recursos empleados) */
  miembros: { role: string }[];
  sedes: number;
};

export type Memoria = {
  periodo: { desde: string; hasta: string };
  expedientesTramitados: number;
  expedientesIniciados: number;
  expedientesPresentados: number;
  personasAtendidas: number;
  /** Resultado de los expedientes tramitados en el período — la medida de eficacia. */
  resoluciones: { concedidos: number; denegados: number; desistidos: number };
  procedimientos: { label: string; n: number }[];
  actuaciones: { label: string; n: number }[];
  recursos: { personas: number; porRol: { rol: string; n: number }[]; sedes: number };
  alcance: { nacionalidades: number; diasMedios: number | null; documentosValidados: number; formulariosGenerados: number };
};

// Etiquetas de las actuaciones: el enum EventoTipo dicho en el lenguaje de la orden,
// no en el de la base de datos. Un evento sin etiqueta conocida se agrupa aparte en
// vez de desaparecer — una memoria que se come actuaciones no vale nada.
export const ACTUACION_LABEL: Record<string, string> = {
  CREADO: "Alta y estudio inicial del expediente",
  DOC_SUBIDO: "Recepción de documentación",
  DOC_VALIDADO: "Revisión y validación de documentación",
  DOC_RECHAZADO: "Subsanación de documentación",
  FORM_GENERADO: "Cumplimentación de formularios oficiales y tasas",
  ESTADO_CAMBIADO: "Seguimiento del expediente",
  PRESENTADO: "Presentación ante la Administración",
  NOTIFICACION_ENVIADA: "Comunicación con la persona interesada",
  COMENTARIO: "Anotaciones de seguimiento",
};

export const ROL_LABEL: Record<string, string> = {
  OWNER: "Dirección",
  ADMIN: "Administración",
  GESTOR: "Tramitación",
  ASISTENTE: "Apoyo administrativo",
};

/** ¿La fecha ISO cae dentro del período (ambos extremos incluidos)? */
export const enPeriodo = (iso: string | null | undefined, desde: string, hasta: string): boolean => {
  if (!iso) return false;
  const d = String(iso).slice(0, 10);
  return d >= desde && d <= hasta;
};

const ordenar = (m: Map<string, number>) =>
  [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "es"));

// Resultado del expediente. La columna `salida` (flujo v4) manda; si falta, se deduce del
// estado con la MISMA regla que la migración supabase/flujo-v4.sql usó para rellenarla.
// Trampa que motivó esto: el cierre v4 escribe FINALIZADO (concedido) o RECHAZADO
// (denegado), nunca RESUELTO — contar RESUELTO daba 0 para todo el uso actual.
export function resolucionDe(x: Pick<FilaExpediente, "salida" | "estado">): "concedidos" | "denegados" | "desistidos" | null {
  switch (x.salida) {
    case "concedido": return "concedidos";
    case "denegado": return "denegados";
    case "desistido": return "desistidos";
    case "en_tramite": return null;
  }
  if (x.estado === "FINALIZADO" || x.estado === "RESUELTO") return "concedidos";
  if (x.estado === "RECHAZADO") return "denegados";
  return null;
}

export function construirMemoria(e: EntradaMemoria): Memoria {
  const { desde, hasta } = e;

  // «Expediente tramitado» = expediente con actividad REAL en el período: dado de alta
  // dentro, o con alguna actuación registrada dentro. No se cuenta por el estado del
  // tablero: en el uso real la mitad de los despachos no mueve las tarjetas hasta el
  // final, y una memoria que dependa de eso saldría vacía siendo el trabajo cierto.
  const eventosDentro = e.eventos.filter((v) => enPeriodo(v.createdAt, desde, hasta));
  const conActividad = new Set(eventosDentro.map((v) => v.expedienteId));

  // Fecha de presentación EFECTIVA. fechaPresentacion se rellena poco (igual que los
  // estados del tablero), pero el evento PRESENTADO sí queda grabado. Sin este repli la
  // memoria se contradecía a sí misma: «5 presentaciones» en las actuaciones y «0
  // expedientes presentados» en el alcance. Se toma la PRIMERA del período.
  const presentadoPorEvento = new Map<string, string>();
  for (const v of eventosDentro) {
    if (v.tipo !== "PRESENTADO") continue;
    const previa = presentadoPorEvento.get(v.expedienteId);
    if (!previa || v.createdAt < previa) presentadoPorEvento.set(v.expedienteId, v.createdAt);
  }
  const tramitados = e.expedientes.filter((x) => enPeriodo(x.createdAt, desde, hasta) || conActividad.has(x.id));

  const procedimientos = new Map<string, number>();
  const nacionalidades = new Set<string>();
  const personas = new Set<string>();
  const plazos: number[] = [];
  let presentados = 0;
  const resoluciones = { concedidos: 0, denegados: 0, desistidos: 0 };

  for (const x of tramitados) {
    personas.add(x.clienteId);
    if (x.nacionalidad) nacionalidades.add(x.nacionalidad.trim().toLowerCase());
    // Etiqueta del servicio configurado por el despacho; si no la hay, el tipo oficial.
    // El expediente puede llegar con servicioClave o sin ella (según por dónde se creó):
    // se pasa SIEMPRE por la clave canónica antes de etiquetar, o el mismo trámite sale
    // partido en dos líneas («Renovación de TIE» y «Renovación TIE») — visto en datos
    // reales, y en una memoria que va a la Administración eso no vale.
    const clave = x.servicioClave || TIPO_A_SERVICIO[x.tipo] || null;
    const label = (clave && e.servicios[clave]) || TIPO_LABEL[x.tipo] || TIPO_LABEL.OTRO;
    procedimientos.set(label, (procedimientos.get(label) ?? 0) + 1);
    const presentadoEl = enPeriodo(x.fechaPresentacion, desde, hasta) ? x.fechaPresentacion! : presentadoPorEvento.get(x.id);
    if (presentadoEl) {
      presentados++;
      const dias = Math.round((Date.parse(presentadoEl) - Date.parse(x.createdAt)) / 86400000);
      if (Number.isFinite(dias) && dias >= 0) plazos.push(dias);
    }
    const r = resolucionDe(x);
    if (r) resoluciones[r]++;
  }

  const actuaciones = new Map<string, number>();
  for (const v of eventosDentro) {
    const label = ACTUACION_LABEL[v.tipo] ?? "Otras actuaciones";
    actuaciones.set(label, (actuaciones.get(label) ?? 0) + 1);
  }

  const porRol = new Map<string, number>();
  for (const m of e.miembros) {
    const rol = ROL_LABEL[m.role] ?? m.role;
    porRol.set(rol, (porRol.get(rol) ?? 0) + 1);
  }

  const cuenta = (tipo: string) => eventosDentro.filter((v) => v.tipo === tipo).length;

  return {
    periodo: { desde, hasta },
    expedientesTramitados: tramitados.length,
    expedientesIniciados: tramitados.filter((x) => enPeriodo(x.createdAt, desde, hasta)).length,
    expedientesPresentados: presentados,
    resoluciones,
    personasAtendidas: personas.size,
    procedimientos: ordenar(procedimientos),
    actuaciones: ordenar(actuaciones),
    recursos: {
      personas: e.miembros.length,
      porRol: [...porRol.entries()].map(([rol, n]) => ({ rol, n })).sort((a, b) => b.n - a.n || a.rol.localeCompare(b.rol, "es")),
      sedes: e.sedes,
    },
    alcance: {
      nacionalidades: nacionalidades.size,
      diasMedios: plazos.length ? Math.round(plazos.reduce((a, b) => a + b, 0) / plazos.length) : null,
      documentosValidados: cuenta("DOC_VALIDADO"),
      formulariosGenerados: cuenta("FORM_GENERADO"),
    },
  };
}
