import { ClientPortal } from "@/components/client-portal";
import { PortalCompletado } from "@/components/portal-completado";
import { AprobaMark } from "@/components/logo";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { fetchStripeKeyDeWorkspace } from "@/lib/cobros-tarjeta";
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
  let valido = false;
  let clienteIdioma = "es";
  let tarjetaActiva = false;

  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("Expediente")
      .select(`id, referencia, cliente:Cliente(${SELECT_CLIENTE}), workspace:Workspace(id, nombre)`)
      .eq("portalToken", token)
      .maybeSingle();

    const exp = data as unknown as ExpedienteToken | null;
    if (exp?.workspace) {
      valido = true;
      referencia = exp.referencia;
      clienteNombre = exp.cliente?.nombre;
      clienteFicha = fichaDe(exp.cliente);
      gestoria = exp.workspace.nombre;
      portalToken = token;
      clienteIdioma = exp.cliente?.idioma ?? "es";
      servicios = await fetchServiciosDeWorkspace(admin, exp.workspace.id);
      // Cobro con tarjeta del anticipo: solo si la gestoría tiene su clave Stripe.
      tarjetaActiva = Boolean(await fetchStripeKeyDeWorkspace(admin, exp.workspace.id));
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
    }
  } catch {
    /* token illisible → traité comme lien invalide ci-dessous */
  }

  // Token inconnu / expiré → ce n'est PAS la démo (celle-ci vit sur /portal) : lien invalide.
  if (!valido) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-cream-50 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">Este enlace no es válido</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">El enlace ha caducado o no es correcto. Pide a tu gestoría que te envíe uno nuevo.</p>
        <p className="mt-6 flex items-center gap-1 text-xs text-slate-400">con <AprobaMark size={13} /> aproba</p>
      </div>
    );
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
      tarjetaActiva={tarjetaActiva}
    />
  );
}
