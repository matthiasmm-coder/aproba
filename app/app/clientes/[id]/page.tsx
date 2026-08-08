import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ESTADO_META } from "@/lib/types";
import { TIPO_LABEL, fmtFechaCorta } from "@/lib/tramites";
import { FACTURA_ESTADO_META, eur, totalDe, type FacturaEstado } from "@/lib/facturas";
import { formulariosDisponibles } from "@/lib/ex-forms";
import { ClienteFormularios } from "@/components/cliente-formularios";
import { CrearFamiliaCliente } from "@/components/crear-familia-cliente";
import { DocumentosCliente, type DocSuelto } from "@/components/documentos-cliente";
import { CaducidadTie } from "@/components/caducidad-tie";
import { EditarCliente } from "@/components/editar-cliente";
import { EliminarClienteButton } from "@/components/eliminar-cliente-button";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { getT } from "@/lib/app-lang";

// Fiche client — RÉELLE (Supabase + RLS) : le cliente, ses expedientes et ses
// facturas du workspace. Clé = id réel du cliente (plus de données démo).
function initials(name: string) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

const ESTADO_FALLBACK = { dot: "bg-slate-300", pill: "bg-slate-100 text-slate-600", label: "—" };

export default async function ClienteDetail({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const supabase = await createSupabaseServer();

  // Ficha completa (para el editor) — todos los campos personales. fechaCaducidad (Vigía):
  // select defensivo, repli sin la columna si falta la migración.
  const FICHA_SELECT = ["id", ...FICHA_KEYS].join(", ");
  let resCliente = await supabase.from("Cliente").select(`${FICHA_SELECT}, fechaCaducidad`).eq("id", id).maybeSingle();
  if (resCliente.error) resCliente = await supabase.from("Cliente").select(FICHA_SELECT).eq("id", id).maybeSingle();
  const cliente = resCliente.data as (ClienteFicha & { id: string; fechaCaducidad?: string | null }) | null;
  if (!cliente) notFound();

  // Objeto ficha (solo las claves conocidas) para el editor.
  const ficha = Object.fromEntries(FICHA_KEYS.map((k) => [k, (cliente as Record<string, unknown>)[k] ?? ""])) as ClienteFicha;

  const nombre = `${cliente.nombre ?? ""} ${cliente.apellidos ?? ""}`.trim();

  // ¿Pertenece ya a una familia? (columna fuera de FICHA_SELECT; defensivo pre-migración)
  let familiaId: string | null = null;
  {
    const { data: fam, error: eFam } = await supabase.from("Cliente").select("familiaId").eq("id", id).maybeSingle();
    if (!eFam) familiaId = (fam as { familiaId?: string | null } | null)?.familiaId ?? null;
  }

  const { data: expRows } = await supabase.from("Expediente").select("id, referencia, tipo, estado, createdAt").eq("clienteId", id).order("createdAt", { ascending: false });

  // Facturas del cliente — por FK clienteId (fix homónimos 06/08: dos «Juan García» del
  // mismo despacho ya NO comparten facturas). El repli por nombre queda SOLO para:
  //   · facturas antiguas sin backfill y manuales de nombre libre (clienteId IS NULL);
  //   · el despliegue anterior a la migración factura-cliente-id.sql (columna ausente).
  const FAC_COLS = "id, numero, concepto, baseImponible, estado, fechaEmision";
  type FacRow = { id: string; numero: string; concepto: string; baseImponible: number | string; estado: string; fechaEmision: string | null };
  let facRows: FacRow[] = [];
  const porFk = await supabase.from("Factura").select(FAC_COLS).eq("clienteId", id);
  if (!porFk.error) {
    const porNombre = nombre
      ? await supabase.from("Factura").select(FAC_COLS).is("clienteId", null).eq("clienteNombre", nombre)
      : { data: [] as FacRow[] };
    facRows = [...((porFk.data ?? []) as FacRow[]), ...((porNombre.data ?? []) as FacRow[])];
  } else {
    const viejo = await supabase.from("Factura").select(FAC_COLS).eq("clienteNombre", nombre);
    facRows = (viejo.data ?? []) as FacRow[];
  }
  facRows.sort((a, b) => String(b.numero).localeCompare(String(a.numero)));

  const expedientes = (expRows ?? []) as { id: string; referencia: string; tipo: string; estado: string; createdAt: string }[];
  const facturas = facRows.map((f) => ({
    id: f.id,
    numero: f.numero,
    concepto: f.concepto,
    base: Number(f.baseImponible),
    estado: f.estado as FacturaEstado,
    fecha: fmtFechaCorta(f.fechaEmision) ?? "—",
  }));

  const nacionalidad = cliente.nacionalidad ?? "—";
  // Una ANULADA no cuenta como facturado: se dejó sin efecto (auditoría 06/08).
  const totalFacturado = facturas.filter((f) => f.estado !== "BORRADOR" && f.estado !== "ANULADA").reduce((s, f) => s + totalDe(f.base), 0);

  // Documentos sueltos del cliente (sin expediente). Defensivo: [] si falta la migración.
  let docsSueltos: DocSuelto[] = [];
  try {
    const { data: ds, error: eDs } = await supabase.from("DocumentoCliente").select("id, tipo, nombreArchivo, createdAt").eq("clienteId", id).order("createdAt", { ascending: false });
    if (!eDs) docsSueltos = (ds ?? []) as unknown as DocSuelto[];
  } catch { /* tabla aún no migrada */ }

  // Historial de servicios: trámites del PASADO (migrados o cerrados). Defensivo: [] si la
  // tabla ServicioHistorico aún no está migrada. Se fusiona con los expedientes REALES para
  // que la ficha cuente UNA sola historia, venga de una migración o de un expediente.
  let historicos: { id: string; tipo: string; etiqueta: string | null; fecha: string | null; estado: string | null; importe: number | string | null }[] = [];
  try {
    const { data: hs, error: eh } = await supabase
      .from("ServicioHistorico")
      .select("id, tipo, etiqueta, fecha, estado, importe")
      .eq("clienteId", id)
      .order("fecha", { ascending: false });
    if (!eh) historicos = (hs ?? []) as typeof historicos;
  } catch { /* tabla aún no migrada */ }

  const servicios = [
    ...expedientes.map((e) => ({
      id: e.id, href: `/app/expedientes/${e.id}` as string | undefined,
      label: TIPO_LABEL[e.tipo] ?? e.tipo, sub: e.referencia, importado: false,
      estado: e.estado, importe: null as number | null, orden: new Date(e.createdAt).getTime() || 0,
    })),
    ...historicos.map((h) => ({
      id: h.id, href: undefined as string | undefined,
      label: h.etiqueta || TIPO_LABEL[h.tipo] || h.tipo, sub: fmtFechaCorta(h.fecha) ?? "—", importado: true,
      estado: h.estado || "FINALIZADO", importe: h.importe != null ? Number(h.importe) : null, orden: h.fecha ? (new Date(h.fecha).getTime() || 0) : 0,
    })),
  ].sort((a, b) => b.orden - a.orden);
  // Total facturado en el PASADO (histórico migrado) — informativo, NO son facturas emitidas.
  const historicoTotal = servicios.reduce((s, x) => s + (x.importe ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Clientes")}
      </Link>

      {/* En-tête */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-lg font-semibold text-aproba-700">{initials(nombre)}</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{nombre}</h1>
            <p className="text-slate-500">{nacionalidad}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex items-center gap-3">
            <EliminarClienteButton clienteId={cliente.id} nombre={nombre} />
            <EditarCliente clienteId={cliente.id} ficha={ficha} />
          </div>
          <div className="hidden gap-6 text-center sm:flex">
            <div><p className="text-2xl font-bold tracking-tightest text-slate-900">{servicios.length}</p><p className="text-xs text-slate-400">{t("servicios")}</p></div>
            <div><p className="text-2xl font-bold tracking-tightest text-slate-900">{eur(totalFacturado)}</p><p className="text-xs text-slate-400">{t("facturado")}</p></div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Historial de servicios — expedientes reales + servicios migrados, una sola historia */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Historial de servicios")} ({servicios.length})</h2>
              {historicoTotal > 0 && <p className="mt-0.5 text-xs text-slate-400">{eur(historicoTotal)} {t("facturado (histórico)")}</p>}
            </div>
            <Link href="/app/expedientes/nuevo" className="text-sm font-semibold text-aproba-700 hover:underline">{t("+ Nuevo")}</Link>
          </div>
          <div className="space-y-1">
            {servicios.map((s) => {
              const meta = ESTADO_META[s.estado as keyof typeof ESTADO_META] ?? { ...ESTADO_FALLBACK, label: s.estado };
              const cuerpo = (
                <>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  {/* El nombre ocupa su propia línea (bloque truncado): un badge en la misma
                      línea flex lo aplastaba a cero y desbordaba sobre el importe. */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{t(s.label)}</p>
                    {/* Meta en 2ª línea: la tarjeta es estrecha, y en la 1ª el nombre quedaba
                        aplastado (o desbordaba) al competir con el badge y el importe. */}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-400">
                      {/* Servicio prestado ANTES de usar Aproba (traído por la migración) */}
                      {s.importado && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Pre-migración")}</span>}
                      <span className={`truncate ${s.importado ? "" : "font-mono"}`}>{s.sub}</span>
                      {s.importe != null && <span className="shrink-0 font-semibold text-slate-600">· {eur(s.importe)}</span>}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span>
                </>
              );
              return s.href ? (
                <Link key={s.id} href={s.href} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-cream-50">{cuerpo}</Link>
              ) : (
                <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-2">{cuerpo}</div>
              );
            })}
            {servicios.length === 0 && <p className="px-2 text-sm text-slate-400">{t("Sin servicios.")}</p>}
          </div>
        </div>

        {/* Facturas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Facturas")} ({facturas.length})</h2>
            <Link href={`/app/facturas/nueva?cliente=${encodeURIComponent(nombre)}`} className="text-sm font-semibold text-aproba-700 hover:underline">{t("+ Nueva")}</Link>
          </div>
          <div className="space-y-1">
            {facturas.map((f) => {
              const meta = FACTURA_ESTADO_META[f.estado];
              return (
                <Link key={f.id} href={`/app/facturas/${f.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-cream-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{f.concepto}</p>
                    <p className="font-mono text-xs text-slate-400">{f.numero} · {f.fecha}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-800">{eur(totalDe(f.base))}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span>
                </Link>
              );
            })}
            {facturas.length === 0 && <p className="px-2 text-sm text-slate-400">{t("Sin facturas.")}</p>}
          </div>
        </div>
      </div>

      {/* Vigía: caducidad de la TIE — amorça el radar sobre la cartera existente */}
      <CaducidadTie clienteId={cliente.id} fechaActual={cliente.fechaCaducidad ?? null} />

      {/* Documentos sueltos du client (passeport, TIE… — sans expediente) */}
      <DocumentosCliente clienteId={cliente.id} docs={docsSueltos} />

      {/* Formularios officiels autorrellenés depuis la ficha du cliente (sans expediente) */}
      <ClienteFormularios clienteId={cliente.id} formularios={formulariosDisponibles()} />

      {/* Cliente individual → crear una familia a partir de él (pasa a ser el titular) */}
      {!familiaId && <CrearFamiliaCliente clienteId={cliente.id} nombreCompleto={nombre} apellidos={cliente.apellidos ?? ""} />}
    </div>
  );
}
