import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace, parsePacks } from "@/lib/data/config";
import { TIPO_LABEL, TIPO_A_SERVICIO } from "@/lib/tramites";
import { EspacioCliente, type EspacioExp, type EspacioServicio } from "@/components/espacio-cliente";

// ESPACIO PERSISTENTE DEL CLIENTE — /c/[espacioToken] (token estable por PERSONA).
// Nace solo, al terminar su primer expediente: lista todos sus trámites (en curso,
// terminados e histórico pre-migración) y permite SOLICITAR un trámite nuevo, que
// aparece al instante en el tablero del gestor (+ email).

// Los enlaces del portal llevan el token en la URL: nunca deben indexarse.
export const metadata = { robots: { index: false, follow: false } };
// Datos SIEMPRE frescos (mismo criterio que /s): sin esto Vercel cachea la lista.
export const dynamic = "force-dynamic";

const fmtFecha = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default async function EspacioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();
  const admin = createSupabaseAdmin();

  // Cliente por token de espacio (defensivo: sin la migración → 404, nunca 500).
  type ClienteRow = { id: string; nombre: string | null; idioma: string | null; workspaceId: string };
  let cliente: ClienteRow | null = null;
  try {
    const { data, error } = await admin
      .from("Cliente")
      .select("id, nombre, idioma, workspaceId")
      .eq("espacioToken", token)
      .maybeSingle();
    if (!error) cliente = data as ClienteRow | null;
  } catch { /* columna ausente */ }
  if (!cliente) notFound();

  // Packs junto al nombre (repli pre-migración servicios-pro.sql sin la columna).
  let resWs = await admin.from("Workspace").select("nombre, packs").eq("id", cliente.workspaceId).maybeSingle();
  if (resWs.error) resWs = await admin.from("Workspace").select("nombre").eq("id", cliente.workspaceId).maybeSingle();
  const ws = resWs.data;
  const gestoria = (ws as { nombre?: string } | null)?.nombre ?? "Tu gestoría";

  // Expedientes del cliente (defensivo con las columnas más nuevas).
  type ExpRow = { id: string; referencia: string; estado: string; tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null; portalToken: string | null; archivadoAt?: string | null; createdAt: string };
  const BASE = "id, referencia, estado, tipo, servicioClave, portalToken, createdAt";
  let resExp = await admin.from("Expediente").select(`${BASE}, serviciosExtra, archivadoAt`).eq("clienteId", cliente.id).order("createdAt", { ascending: false });
  if (resExp.error) resExp = await admin.from("Expediente").select(`${BASE}, archivadoAt`).eq("clienteId", cliente.id).order("createdAt", { ascending: false }) as typeof resExp;
  if (resExp.error) resExp = await admin.from("Expediente").select(BASE).eq("clienteId", cliente.id).order("createdAt", { ascending: false }) as typeof resExp;
  const exps = (resExp.data ?? []) as ExpRow[];

  // Historial pre-migración (servicios prestados antes de la plataforma).
  let historicos: { etiqueta: string | null; fecha: string | null; estado: string | null }[] = [];
  try {
    const { data: hs, error: eh } = await admin
      .from("ServicioHistorico")
      .select("etiqueta, fecha, estado")
      .eq("clienteId", cliente.id)
      .order("fecha", { ascending: false });
    if (!eh) historicos = (hs ?? []) as typeof historicos;
  } catch { /* tabla aún no migrada */ }

  const servicios = await fetchServiciosDeWorkspace(admin, cliente.workspaceId);
  const labelDe = (clave: string | null, tipo: string) =>
    servicios.find((s) => s.id === (clave ?? TIPO_A_SERVICIO[tipo]))?.label ?? TIPO_LABEL[tipo] ?? tipo;

  const terminado = (e: ExpRow) => e.estado === "FINALIZADO" || e.estado === "RECHAZADO" || Boolean(e.archivadoAt);
  const items: EspacioExp[] = exps.map((e) => ({
    referencia: e.referencia,
    servicioId: e.servicioClave ?? TIPO_A_SERVICIO[e.tipo] ?? null,
    label: labelDe(e.servicioClave, e.tipo),
    extras: (e.serviciosExtra ?? []).map((x) => ({ id: x, label: servicios.find((s) => s.id === x)?.label ?? x })),
    denegado: e.estado === "RECHAZADO",
    enCurso: !terminado(e),
    url: e.portalToken ? `/s/${e.portalToken}` : null,
    fecha: fmtFecha(e.createdAt),
  }));
  // El histórico importado entra como «terminado», sin enlace (no hay expediente).
  const historial: EspacioExp[] = historicos.map((h) => ({
    referencia: "", servicioId: null, label: h.etiqueta ?? "—", extras: [],
    denegado: h.estado === "RECHAZADO", enCurso: false, url: null, fecha: fmtFecha(h.fecha),
  }));

  const activos: EspacioServicio[] = servicios
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, label: s.label, precio: s.precio, precioOculto: s.precioOculto, porcentaje: s.porcentaje, porcentajeSobre: s.porcentajeSobre, categoria: s.categoria }));
  // Packs del despacho: solo los que resuelven contra servicios activos (un pack que
  // apunta a servicios borrados o desactivados no se ofrece).
  const packs = parsePacks((ws as { packs?: unknown } | null)?.packs)
    .map((p) => ({ ...p, servicioIds: p.servicioIds.filter((id) => activos.some((s) => s.id === id)) }))
    .filter((p) => p.servicioIds.length > 0);

  return (
    <EspacioCliente
      token={token}
      gestoria={gestoria}
      nombre={cliente.nombre ?? ""}
      idioma={cliente.idioma ?? "es"}
      enCurso={items.filter((i) => i.enCurso)}
      terminados={[...items.filter((i) => !i.enCurso), ...historial]}
      servicios={activos}
      packs={packs}
    />
  );
}
