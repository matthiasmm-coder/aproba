import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { DOC_LABEL, TIPO_A_SERVICIO, labelADocTipo } from "@/lib/tramites";
import { serviciosDeExpediente, docsDeServicios, citaDeServicios, asignacionValida } from "@/lib/multi-servicio";
import { docsFamiliaPorServicios } from "@/lib/familia";
import { formulariosDelTramite } from "@/lib/ex-forms";
import { Seguimiento, type SegDoc } from "@/components/seguimiento";

// Los enlaces del portal llevan el token en la URL: nunca deben indexarse.
export const metadata = { robots: { index: false, follow: false } };


// Estados en los que los formularios ya están generados (se exponen al cliente).
const FORM_LISTOS = new Set(["FORM_GENERADO", "PRESENTADO", "RESUELTO", "CITA_HUELLAS", "FINALIZADO"]);

// Lien de SUIVI (distinct du lien d'onboarding /j) : page d'avancement par
// milestone + documents soumis / à soumettre. Réutilise le même token sécurisé.
// Portal del cliente: SIEMPRE datos frescos. Sin esto, Next.js/Vercel cachea la
// respuesta (incl. hojaEncargoActiva, estados de documentos) y sirve versiones viejas.
export const dynamic = "force-dynamic";

export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();

  const BASE = "id, referencia, estado, tipo, servicioClave, fechaCita, citaHora, citaLugar, citaNotas, cliente:Cliente(nombre, idioma), workspace:Workspace(id, nombre)";
  // Documento.clienteId: atribuye cada subida a su miembro (familia). Repli sin él al final.
  const SELECT = `${BASE}, documentos:Documento(id, tipo, estado, storagePath, clienteId)`;
  const SELECT_VIEJO = `${BASE}, documentos:Documento(id, tipo, estado, storagePath)`;
  // Intenta con las columnas nuevas; si la migración aún no se aplicó, repli sin ellas
  // (la MÁS nueva se quita primero: serviciosAsignacion → serviciosExtra → …).
  let res = await admin.from("Expediente").select(`${SELECT}, serviciosExtra, serviciosAsignacion, formulariosPorMiembro, formulariosGenerados, tasaPath, familiaId`).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(`${SELECT}, serviciosExtra, serviciosAsignacion, formulariosGenerados, tasaPath, familiaId`).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(`${SELECT}, serviciosExtra, formulariosGenerados, tasaPath, familiaId`).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(`${SELECT}, formulariosGenerados, tasaPath, familiaId`).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(`${SELECT}, formulariosGenerados, tasaPath`).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(SELECT).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(SELECT_VIEJO).eq("portalToken", token).maybeSingle();
  const data = res.data;

  type Row = {
    id: string; referencia: string; estado: string; tipo: string;
    servicioClave: string | null; fechaCita: string | null; citaHora: string | null; citaLugar: string | null; citaNotas: string | null;
    serviciosExtra?: string[] | null; serviciosAsignacion?: unknown;
    formulariosGenerados?: string[] | null; formulariosPorMiembro?: Record<string, string[]> | null; tasaPath?: string | null; familiaId?: string | null;
    cliente: { nombre: string | null; idioma: string | null } | { nombre: string | null; idioma: string | null }[] | null;
    workspace: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
    documentos: { id: string; tipo: string; estado: string; storagePath: string | null; clienteId?: string | null }[] | null;
  };
  const exp = data as unknown as Row | null;
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const ws = uno(exp?.workspace ?? null);
  if (!exp || !ws) notFound();

  const cliente = uno(exp.cliente ?? null);
  const servicios = await fetchServiciosDeWorkspace(admin, ws.id);
  // Multi-servicio: principal + extras → unión de docs, cita fusionada (mismas reglas
  // que la ficha del gestor y la API — la timeline no debe prometer otra cosa).
  const serviciosExp = serviciosDeExpediente(exp, servicios);
  const servicio = servicios.find((s) => s.id === (exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo]));
  const cita = citaDeServicios(serviciosExp);
  // Hoja de encargo + mandato firmados: huecos adicionales si la gestoría lo activó.
  let encargoActivo = false;
  try {
    const { data: wsc } = await admin.from("Workspace").select("hojaEncargoActiva").eq("id", ws.id).maybeSingle();
    // Solo si el servicio resuelve (mismo criterio que datosEncargo) → sin dead link.
    encargoActivo = Boolean((wsc as { hojaEncargoActiva?: boolean } | null)?.hojaEncargoActiva) && Boolean(servicio);
  } catch { /* pre-migración */ }
  const requeridos: string[] = [
    ...docsDeServicios(serviciosExp),
    ...(encargoActivo ? [DOC_LABEL.HOJA_ENCARGO, DOC_LABEL.MANDATO] : []),
  ];

  // Statut d'un document requis (par type normalisé + membre) + id pour le téléchargement.
  const subidoDe = (tipo: string, clienteId: string | null, replComun = false) =>
    (exp.documentos ?? []).find((d) => d.tipo === tipo && (d.clienteId ?? null) === clienteId)
    // Continuidad: un doc PERSONAL subido por el /s antiguo (plano, sin clienteId) no debe
    // volver a pedirse — vale el común del mismo tipo, salvo si ese tipo ES común de verdad.
    ?? (replComun && clienteId !== null ? (exp.documentos ?? []).find((d) => d.tipo === tipo && (d.clienteId ?? null) === null) : undefined);
  const segDoc = (label: string, clienteId: string | null, grupo?: string, replComun = false): SegDoc => {
    const d = subidoDe(labelADocTipo(label), clienteId, replComun);
    const status: SegDoc["status"] =
      d?.estado === "VALIDADO" ? "ok" : d?.estado === "PROCESANDO" ? "procesando" : d?.estado === "RECHAZADO" ? "rechazado" : "pendiente";
    return { label, status, docId: d?.storagePath ? d.id : undefined, ...(clienteId ? { clienteId } : {}), ...(grupo ? { grupo } : {}) };
  };
  const docs: SegDoc[] = requeridos.map((label) => segDoc(label, null));

  // Formularios descargables: la selección EXACTA que el gestor generó (persistida);
  // si no está (expedientes antiguos / antes de la migración), repli sobre los modelos
  // del trámite una vez generados. La tasa se muestra si el gestor la guardó.
  // SOLO lo que el gestor GENERÓ (persistido). Nada de modelos por defecto según el
  // estado: sin generación explícita el cliente no ve formularios (pedido de Matthias).
  // Único repli: columna ilegible (pre-migración, formulariosGenerados === undefined).
  const formularios = Array.isArray(exp.formulariosGenerados)
    ? exp.formulariosGenerados
    : (exp.formulariosGenerados === undefined && FORM_LISTOS.has(exp.estado)
      ? formulariosDelTramite(exp.tipo, [exp.servicioClave, ...(exp.serviciosExtra ?? [])]) : []);
  const tasaDisponible = Boolean(exp.tasaPath);

  // Expediente FAMILIAR: descargas POR SOLICITANTE (formularios con sus datos + su tasa
  // nominativa, presencia detectada en el storage por ruta determinista).
  let miembros: { id: string; nombre: string; tieneTasa: boolean; formularios?: string[] }[] | undefined;
  // Familia: documentos agrupados — COMUNES (una vez) + los de CADA miembro según SUS
  // servicios asignados (mismo helper que el portal /j). Sin asignación → retro-compat.
  let docsFamiliares: SegDoc[] | undefined;
  let gruposDocs: { id: string; nombre?: string; parentesco?: string | null }[] | undefined;
  if (exp.familiaId) {
    let mm = await admin.from("Cliente").select("id, nombre, apellidos, parentesco, esSolicitante, fechaNacimiento").eq("familiaId", exp.familiaId);
    if (mm.error) mm = await admin.from("Cliente").select("id, nombre, apellidos, parentesco, esSolicitante").eq("familiaId", exp.familiaId) as typeof mm;
    if (mm.error) mm = await admin.from("Cliente").select("id, nombre, apellidos, parentesco").eq("familiaId", exp.familiaId) as typeof mm;
    const rows = ((mm.data ?? []) as unknown[]) as { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null; esSolicitante?: boolean; fechaNacimiento?: string | null }[];
    const asignacion = asignacionValida(exp.serviciosAsignacion);
    const asignados = new Set(Object.values(asignacion ?? {}).flat());
    const sol = rows.filter((r) => r.esSolicitante || asignados.has(r.id));
    const lista = sol.length ? sol : rows;
    const { data: archivos } = await admin.storage.from("documentos").list(exp.id);
    const conTasa = new Set((archivos ?? []).map((a) => a.name).filter((n) => /^tasa-790-012-.+\.pdf$/.test(n)).map((n) => n.slice("tasa-790-012-".length, -".pdf".length)));
    // Formularios del MIEMBRO: exactamente la selección que el gestor generó para él
    // (formulariosPorMiembro). Sin mapa (datos antiguos) → repli a la lista plana.
    const pmForms = exp.formulariosPorMiembro && typeof exp.formulariosPorMiembro === "object" && !Array.isArray(exp.formulariosPorMiembro)
      ? exp.formulariosPorMiembro : null;
    miembros = lista.map((r) => ({
      id: r.id,
      nombre: `${r.nombre ?? ""} ${r.apellidos ?? ""}`.trim() || "Miembro",
      tieneTasa: conTasa.has(r.id),
      formularios: pmForms ? (pmForms[r.id] ?? []) : formularios,
    }));

    const fam = docsFamiliaPorServicios(serviciosExp, asignacion, lista.map((r) => ({ id: r.id, fechaNacimiento: r.fechaNacimiento ?? null })));
    const tiposComunes = new Set([DOC_LABEL.HOJA_ENCARGO, DOC_LABEL.MANDATO, ...fam.comunes].map(labelADocTipo));
    docsFamiliares = [
      ...(encargoActivo ? [DOC_LABEL.HOJA_ENCARGO, DOC_LABEL.MANDATO] : []).map((l) => segDoc(l, null, "comunes")),
      ...fam.comunes.map((l) => segDoc(l, null, "comunes")),
      ...lista.flatMap((r) => (fam.porMiembro[r.id] ?? []).map((l) => segDoc(l, r.id, r.id, !tiposComunes.has(labelADocTipo(l))))),
    ];
    gruposDocs = [
      ...(docsFamiliares.some((d) => d.grupo === "comunes") ? [{ id: "comunes" }] : []),
      ...lista
        .filter((r) => (fam.porMiembro[r.id] ?? []).length)
        .map((r) => ({ id: r.id, nombre: `${r.nombre ?? ""} ${r.apellidos ?? ""}`.trim() || "Miembro", parentesco: r.parentesco })),
    ];
  }

  return (
    <Seguimiento
      token={token}
      gestoria={ws.nombre}
      clienteNombre={cliente?.nombre ?? ""}
      idioma={cliente?.idioma ?? "es"}
      referencia={exp.referencia}
      estado={exp.estado}
      citaPresencial={cita.citaPresencial}
      citaQuien={cita.citaQuien}
      cita={{ fecha: exp.fechaCita, hora: exp.citaHora, lugar: exp.citaLugar, notas: exp.citaNotas }}
      docs={docsFamiliares ?? docs}
      gruposDocs={gruposDocs}
      formularios={formularios}
      tasaDisponible={tasaDisponible}
      miembros={miembros}
    />
  );
}
