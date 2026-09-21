import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { trabajadorPorToken } from "@/lib/trabajador-token";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { asignacionValida, serviciosDeExpediente } from "@/lib/multi-servicio";
import { docsEmpresaPorTrabajador } from "@/lib/familia";
import { logoDelWorkspace } from "@/lib/marca";
import { TIPO_A_SERVICIO } from "@/lib/tramites";
import { AprobaMark } from "@/components/logo";
import { PortalTrabajador } from "@/components/portal-trabajador";

// ENLACE INDIVIDUAL DEL TRABAJADOR (lote 3, 21/09/2026). El token de ExpedienteTrabajador es
// la ÚNICA credencial: abre sus documentos y su mandato dentro del expediente de su
// empresa, y nada más. Un token desconocido → enlace no válido (nunca «Hola Julia»).
export const dynamic = "force-dynamic";
export const metadata = { title: "Tus documentos", robots: { index: false, follow: false } };

export default async function PaginaTrabajador({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();
  const tr = await trabajadorPorToken(admin, token);

  if (!tr) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-cream-50 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">Este enlace no es válido</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">El enlace ha caducado o no es correcto. Pide a tu empresa o a tu gestoría que te envíen uno nuevo.</p>
        <p className="mt-6 flex items-center gap-1 text-xs text-slate-400">con <AprobaMark size={13} /> aproba</p>
      </div>
    );
  }

  const { exp, cliente } = tr;
  const { data: ws } = await admin.from("Workspace").select("id, nombre, hojaEncargoActiva").eq("id", exp.workspaceId).maybeSingle();
  const w = ws as { id: string; nombre: string; hojaEncargoActiva?: boolean } | null;
  const gestoria = w?.nombre ?? "Tu gestoría";
  const logoUrl = w ? await logoDelWorkspace(admin, w.id, exp.oficinaId ?? null) : null;

  let empresa = "tu empresa";
  if (exp.empresaId) {
    const { data: em } = await admin.from("Empresa").select("razonSocial").eq("id", exp.empresaId).maybeSingle();
    empresa = String((em as { razonSocial?: string } | null)?.razonSocial ?? "").trim() || empresa;
  }

  // Sus documentos: los del servicio del expediente (por trabajador, con la asignación si
  // la hay) — el MISMO repartidor que el portal de la empresa y la ficha del gestor.
  const servicios = await fetchServiciosDeWorkspace(admin, exp.workspaceId, exp.oficinaId ?? null);
  const serviciosExp = serviciosDeExpediente({ servicioClave: exp.servicioClave, serviciosExtra: exp.serviciosExtra, tipo: exp.tipo }, servicios);
  const rep = docsEmpresaPorTrabajador(serviciosExp, asignacionValida(exp.serviciosAsignacion), [{ id: cliente.id, fechaNacimiento: cliente.ficha.fechaNacimiento ?? null }], exp.docsExtra);
  const docs = rep.porMiembro[cliente.id] ?? [];

  // Mandato descargable solo si la gestoría activó la hoja de encargo y el servicio resuelve
  // (mismo criterio que /j: si no, el botón daría un 409).
  let encargoActivo = false;
  try {
    const { hojaEncargoActivaEfectiva } = await import("@/lib/facturacion-oficina");
    const claveServicio = exp.servicioClave ?? (exp.tipo ? TIPO_A_SERVICIO[exp.tipo] : undefined);
    const resuelve = Boolean(claveServicio) && servicios.some((sv) => sv.id === claveServicio);
    encargoActivo = w ? (await hojaEncargoActivaEfectiva(admin, w.id, exp.oficinaId ?? null, Boolean(w.hojaEncargoActiva))) && resuelve : false;
  } catch { encargoActivo = false; }

  return (
    <PortalTrabajador
      token={token}
      idiomaInicial={cliente.idioma}
      gestoria={gestoria}
      logoUrl={logoUrl}
      empresa={empresa}
      clienteId={cliente.id}
      nombre={cliente.nombre}
      apellidos={cliente.apellidos}
      docs={docs}
      encargoActivo={encargoActivo}
    />
  );
}
