import { ClientPortal } from "@/components/client-portal";
import { PortalCompletado } from "@/components/portal-completado";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { DEFAULT_SERVICIOS, type Servicio } from "@/lib/servicios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

// Lien WhatsApp du client : /j/{token} → résout l'expediente réel (cliente,
// gestoría, services + tarifas du workspace). Token inconnu → portail de démo.

const SELECT_CLIENTE = "nombre, apellidos, email, telefono, nacionalidad, numeroDocumento, sexo, fechaNacimiento, lugarNacimiento, paisNacimiento, estadoCivil, via, numeroVia, piso, codigoPostal, provincia, municipio, nombrePadre, nombreMadre, idioma";

type ExpedienteToken = {
  id: string;
  referencia: string;
  cliente: (Record<string, string | null> & { nombre: string; idioma?: string | null }) | null;
  workspace: { id: string; nombre: string } | null;
};

const fichaDe = (c: Record<string, string | null> | null): ClienteFicha => {
  const f: Record<string, string> = {};
  if (c) for (const k of FICHA_KEYS) { const v = c[k]; if (typeof v === "string" && v) f[k] = v; }
  return f as ClienteFicha;
};

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let servicios: Servicio[] = DEFAULT_SERVICIOS;
  let referencia: string | undefined;
  let clienteNombre: string | undefined;
  let clienteFicha: ClienteFicha | undefined;
  let gestoria: string | undefined;
  let portalToken: string | undefined;
  let completado = false;
  let clienteIdioma = "es";

  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("Expediente")
      .select(`id, referencia, cliente:Cliente(${SELECT_CLIENTE}), workspace:Workspace(id, nombre)`)
      .eq("portalToken", token)
      .maybeSingle();

    const exp = data as unknown as ExpedienteToken | null;
    if (exp?.workspace) {
      referencia = exp.referencia;
      clienteNombre = exp.cliente?.nombre;
      clienteFicha = fichaDe(exp.cliente);
      gestoria = exp.workspace.nombre;
      portalToken = token;
      clienteIdioma = exp.cliente?.idioma ?? "es";
      servicios = await fetchServiciosDeWorkspace(admin, exp.workspace.id);
      // Parcours déjà terminé (notif de suivi envoyée) → le lien initial ne se rejoue plus.
      const { data: fin } = await admin
        .from("ExpedienteEvento")
        .select("id")
        .eq("expedienteId", exp.id)
        .eq("tipo", "NOTIFICACION_ENVIADA")
        .ilike("descripcion", "%seguimiento%")
        .limit(1)
        .maybeSingle();
      completado = Boolean(fin);
    } else {
      // Démo : lien générique → workspace de la Gestoría Vallès.
      const { data: ws } = await admin.from("Workspace").select("id").eq("nombre", "Gestoría Vallès").limit(1).maybeSingle();
      if (ws) servicios = await fetchServiciosDeWorkspace(admin, ws.id);
    }
  } catch {
    /* fallback defaults */
  }

  // Lien initial déjà utilisé jusqu'au bout → on ne rejoue pas l'onboarding.
  if (completado && portalToken) {
    return <PortalCompletado token={portalToken} gestoria={gestoria ?? "Tu gestoría"} idioma={clienteIdioma} />;
  }

  return (
    <ClientPortal
      servicios={servicios}
      referencia={referencia}
      clienteNombre={clienteNombre}
      clienteFicha={clienteFicha}
      gestoria={gestoria}
      token={portalToken}
    />
  );
}
