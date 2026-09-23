import { fetchFacturas, fetchCobrosPendientes, TOPE_FACTURAS } from "@/lib/data/facturas";
import { fetchFacturasRecibidas, fetchExpedientesParaVincular } from "@/lib/data/facturas-recibidas";
import { fetchDespacho } from "@/lib/data/config";
import { createSupabaseServer } from "@/lib/supabase/server";
import { puedeGestionarEquipo } from "@/lib/planes";
import { FacturasClient, type ChipVerifactu } from "@/components/facturas-client";
import { fetchRegistrosDeFacturas } from "@/lib/verifactu-envio";
import { ESTADO_REGISTRO_META, type EstadoRegistro } from "@/lib/verifactu";
import { resolverOficina } from "@/lib/data/oficina-filtro";
import { PastillasOficina } from "@/components/pastillas-oficina";

export const metadata = { title: "Facturas" };

// Rol del usuario en su workspace → solo un administrador puede ELIMINAR facturas.
async function esAdminActual(): Promise<boolean> {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return false;
  // El botón Eliminar se muestra si el usuario es admin en ALGUNO de sus workspaces; el gate
  // real del DELETE valida el rol sobre EL workspace de la factura concreta (route.ts).
  const { data: mems } = await supa.from("Membership").select("role").eq("userId", user.id);
  return ((mems ?? []) as { role?: string }[]).some((m) => puedeGestionarEquipo(m.role));
}

// Facturación branchée sur Supabase (RLS).
export default async function Facturas({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  // multi-oficina : les facturas estampillées suivent leur sede ; les non estampillées
  // (manuelles, antérieures à la fase 6) comptent pour la gestoría — jamais masquées
  // en vue « Todas ». Le tampon existe depuis la fase 6, le filtre devient possible.
  const filtroSede = await resolverOficina().catch(() => ({ activa: null, oficinas: [], miOficina: null, autoId: null, sedes: null, incluirSinSede: false }));
  const [facturas, cobros, despacho, esAdmin, recibidas, expedientesVinculables] = await Promise.all([
    fetchFacturas(filtroSede.sedes, filtroSede.incluirSinSede, TOPE_FACTURAS),
    fetchCobrosPendientes(filtroSede.sedes, filtroSede.incluirSinSede),
    fetchDespacho(),
    esAdminActual(),
    fetchFacturasRecibidas(filtroSede.sedes, filtroSede.incluirSinSede).catch(() => []),
    fetchExpedientesParaVincular().catch(() => []),
  ]);
  // NIF/CIF del CSV: una factura emitida ANTES del snapshot fiscal se completa desde el
  // cliente de su expediente y queda congelada — lo mismo que hacen su ficha y el export
  // ZIP (lib/factura-datos-backfill.ts). Un borrador no: sus datos se congelan al emitir.
  try {
    const sinDatos = facturas.filter((f) => !f.clienteDatos && f.expedienteId && f.estado !== "BORRADOR").map((f) => f.id);
    if (sinDatos.length) {
      const { completarClienteDatosFacturas } = await import("@/lib/factura-datos-backfill");
      const m = await completarClienteDatosFacturas(sinDatos);
      for (const f of facturas) if (!f.clienteDatos && m.has(f.id)) f.clienteDatos = m.get(f.id)!;
    }
  } catch { /* sin backfill: el CSV sale con el NIF vacío en esas filas */ }

  // VERI*FACTU: chip por factura registrada (lectura bajo RLS; sin tabla → nada).
  let verifactu: Record<string, ChipVerifactu> | undefined;
  try {
    const regs = await fetchRegistrosDeFacturas(await createSupabaseServer(), facturas.map((f) => f.id));
    const mapa: Record<string, ChipVerifactu> = {};
    for (const f of facturas) {
      const lista = regs[f.id] ?? [];
      const alta = lista.find((r) => r.tipo === "ALTA");
      const anul = lista.find((r) => r.tipo === "ANULACION");
      const reg = f.estado === "ANULADA" && anul ? anul : alta;
      if (!reg) continue;
      const meta = ESTADO_REGISTRO_META[reg.estado as EstadoRegistro] ?? ESTADO_REGISTRO_META.PENDIENTE;
      mapa[f.id] = { tono: meta.tono, label: meta.label, motivo: reg.motivo ?? reg.mensajeError ?? null };
    }
    if (Object.keys(mapa).length) verifactu = mapa;
  } catch { verifactu = undefined; }
  return (
    <div>
      <PastillasOficina oficinas={filtroSede.oficinas} activa={filtroSede.activa} />
      {facturas.length >= TOPE_FACTURAS && (
        <p className="mb-3 text-center text-xs text-slate-400">Mostrando las {TOPE_FACTURAS} facturas más recientes. El export ZIP incluye SIEMPRE todas.</p>
      )}
      <FacturasClient facturas={facturas} cobros={cobros} despacho={despacho} esAdmin={esAdmin} recibidas={recibidas} expedientesVinculables={expedientesVinculables} oficinaActiva={filtroSede.activa} verifactu={verifactu} vistaInicial={vista === "recibidas" ? "recibidas" : "emitidas"} />
    </div>
  );
}
