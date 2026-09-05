import type { SupabaseClient } from "@supabase/supabase-js";
import { MARCA_ENLACE, MARCA_SUBIDA_CLIENTE, type DatosActivacion } from "@/lib/activacion";
import { REFERENCIA_EJEMPLO, EMAIL_CLIENTE_EJEMPLO } from "@/lib/ejemplo-marca";

// Estado de activación del despacho (sesión + RLS). Lo leen el dashboard (checklist) y
// la guía interactiva (GET /api/activacion). El EJEMPLO no cuenta en nada: ni su
// cliente, ni su expediente, ni sus documentos — si contara, «primer cliente» y «primer
// expediente» se darían por hechos sin que el despacho hubiera tocado nada suyo.
export async function fetchDatosActivacion(supabase: SupabaseClient): Promise<DatosActivacion> {
  const cnt = (tabla: string) => supabase.from(tabla).select("id", { count: "exact", head: true });
  const evento = (marca: string) => supabase.from("ExpedienteEvento").select("id", { count: "exact", head: true }).like("descripcion", `%${marca}%`);
  const [svc, cta, cli, mem, sub, exp, enlaces, subidas, ejemplo, docsExp, docsCli, ws, primerCli] = await Promise.all([
    cnt("ServicioConfig"), cnt("CuentaBancaria"),
    cnt("Cliente").or(`email.is.null,email.neq.${EMAIL_CLIENTE_EJEMPLO}`),
    cnt("Membership"),
    supabase.from("Subscription").select("plan").limit(1).maybeSingle(),
    cnt("Expediente").neq("referencia", REFERENCIA_EJEMPLO), evento(MARCA_ENLACE), evento(MARCA_SUBIDA_CLIENTE),
    supabase.from("Expediente").select("id, formulariosGenerados").eq("referencia", REFERENCIA_EJEMPLO).maybeSingle(),
    supabase.from("Documento").select("expedienteId").not("storagePath", "is", null),
    supabase.from("DocumentoCliente").select("id", { count: "exact", head: true }),
    supabase.from("Workspace").select("createdAt").order("createdAt", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("Cliente").select("id").or(`email.is.null,email.neq.${EMAIL_CLIENTE_EJEMPLO}`).limit(1).maybeSingle(),
  ]);
  const ej = ejemplo.data as { id: string; formulariosGenerados?: string[] | null } | null;
  const propiosExp = (docsExp.data ?? []).filter((d) => (d as { expedienteId: string }).expedienteId !== ej?.id).length;
  return {
    clientes: cli.count ?? 0, expedientes: exp.count ?? 0,
    enlacesEnviados: enlaces.count ?? 0, subidasDeCliente: subidas.count ?? 0,
    servicios: svc.count ?? 0, cuentas: cta.count ?? 0, miembros: mem.count ?? 0,
    plan: (sub.data as { plan?: string } | null)?.plan ?? "STARTER",
    ejemploId: ej?.id ?? null,
    ejemploFormulariosGenerados: (ej?.formulariosGenerados ?? []).length > 0,
    documentosPropios: propiosExp + (docsCli.error ? 0 : (docsCli.count ?? 0)),
    creadoEn: (ws.data as { createdAt?: string } | null)?.createdAt ?? null,
    primerClienteId: (primerCli.data as { id?: string } | null)?.id ?? null,
  };
}
