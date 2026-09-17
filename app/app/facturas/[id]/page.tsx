import { notFound } from "next/navigation";
import { fetchFactura } from "@/lib/data/facturas";
import { completarClienteDatosFacturas } from "@/lib/factura-datos-backfill";
import { fetchDespacho } from "@/lib/data/config";
import { createSupabaseServer } from "@/lib/supabase/server";
import { puedeGestionarEquipo } from "@/lib/planes";
import { FacturaView, type Emisor, type VerifactuVista } from "@/components/factura-view";
import { fetchEntregasDeFacturas } from "@/lib/entregas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchRegistrosDeFacturas, refrescarRegistro } from "@/lib/verifactu-envio";
import { ESTADO_REGISTRO_META, registroBloqueaEdicion, type EstadoRegistro } from "@/lib/verifactu";
import { qrDataUrl } from "@/lib/verifactu-qr";

async function esAdminActual(): Promise<boolean> {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return false;
  // El botón Eliminar se muestra si el usuario es admin en ALGUNO de sus workspaces; el gate
  // real del DELETE valida el rol sobre EL workspace de la factura concreta (route.ts).
  const { data: mems } = await supa.from("Membership").select("role").eq("userId", user.id);
  return ((mems ?? []) as { role?: string }[]).some((m) => puedeGestionarEquipo(m.role));
}

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [f, d, esAdmin] = await Promise.all([fetchFactura(id), fetchDespacho(), esAdminActual()]);
  // Factura emitida ANTES del snapshot fiscal → se completa desde el cliente del
  // expediente y queda CONGELADA (pedido de Juan: las antiguas también con datos).
  if (f && !f.clienteDatos) {
    const m = await completarClienteDatosFacturas([f.id]);
    if (m.has(f.id)) f.clienteDatos = m.get(f.id)!;
  }
  if (!f) notFound();

  // Émetteur : la SEDE de la factura si elle a une identité fiscale propre (fase 6),
  // sinon le despacho. La sede vient du tampon, ou de l'expediente pour les anciennes.
  let emisor: Emisor = { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion, logo: d.logoUrl };
  try {
    const supa = await createSupabaseServer();
    const { oficinaDeFacturaFila, fiscalDeOficina, emisorDesdeFiscal } = await import("@/lib/facturacion-oficina");
    const sede = await oficinaDeFacturaFila(supa, { oficinaId: f.oficinaId ?? null, expedienteId: f.expedienteId ?? null });
    if (sede) {
      const fiscal = await fiscalDeOficina(supa, sede);
      const em = emisorDesdeFiscal({ nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion }, fiscal);
      const logoSede = (fiscal?.logoUrl ?? "").trim() || d.logoUrl;
      if (em.deOficina) emisor = { nombre: em.nombre, nif: em.nif, domicilio: em.domicilio, email: em.email, logo: logoSede };
      else if (logoSede !== d.logoUrl) emisor = { ...emisor, logo: logoSede };
    }
  } catch { /* migración fase 6 ausente → emisor del despacho */ }

  // Entregas a cuenta (pagos parciales). Si la migración no está aplicada, viene
  // vacío y el bloque no se pinta: el producto sigue funcionando como antes.
  const entregas = (await fetchEntregasDeFacturas(await createSupabaseServer(), [f.id]))[f.id] ?? [];

  // VERI*FACTU: registro de alta (lectura bajo RLS). Si lleva > 30 s «Pendiente», se
  // pregunta a Verifacti antes de pintar (la AEAT contesta en 1-2 min). Sin tabla → nada.
  let verifactu: VerifactuVista | null = null;
  try {
    const regs = (await fetchRegistrosDeFacturas(await createSupabaseServer(), [f.id]))[f.id] ?? [];
    const alta = regs.find((r) => r.tipo === "ALTA") ?? null;
    const anulacion = regs.find((r) => r.tipo === "ANULACION") ?? null;
    if (alta) {
      if (alta.estado === "PENDIENTE" && alta.uuid && alta.enviadoAt && Date.now() - new Date(alta.enviadoAt).getTime() > 30_000) {
        try { alta.estado = await refrescarRegistro(createSupabaseAdmin(), alta); } catch { /* siguiente barrido */ }
      }
      const visible = f.estado === "ANULADA" && anulacion ? anulacion : alta;
      const estado = visible.estado as EstadoRegistro;
      const meta = ESTADO_REGISTRO_META[estado] ?? ESTADO_REGISTRO_META.PENDIENTE;
      const conQr = Boolean(alta.url) && alta.estado !== "BLOQUEADO" && alta.estado !== "ERROR_ENVIO";
      verifactu = {
        estado, label: meta.label, pill: meta.pill, tono: meta.tono,
        motivo: visible.motivo ?? visible.mensajeError ?? null, url: alta.url,
        qr: conQr && alta.url ? await qrDataUrl(alta.url) : null,
        congelada: registroBloqueaEdicion(alta),
        reintentable: f.estado !== "ANULADA" && (alta.estado === "BLOQUEADO" || alta.estado === "ERROR_ENVIO"),
      };
    }
  } catch { verifactu = null; }

  return <FacturaView f={f} emisor={emisor} editable esAdmin={esAdmin} entregas={entregas} verifactu={verifactu} />;
}
