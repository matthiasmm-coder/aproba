import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ESTADO_META } from "@/lib/types";
import { TIPO_LABEL, fmtFechaCorta } from "@/lib/tramites";
import { FACTURA_ESTADO_META, eur, totalDe, type FacturaEstado } from "@/lib/facturas";
import { formulariosDisponibles } from "@/lib/ex-forms";
import { ClienteFormularios } from "@/components/cliente-formularios";
import { DocumentosCliente, type DocSuelto } from "@/components/documentos-cliente";
import { CaducidadTie } from "@/components/caducidad-tie";
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

  // fechaCaducidad (Vigía): select defensivo — repli sin la columna si falta la migración.
  let resCliente = await supabase.from("Cliente").select("id, nombre, apellidos, nacionalidad, fechaCaducidad").eq("id", id).maybeSingle();
  if (resCliente.error) resCliente = await supabase.from("Cliente").select("id, nombre, apellidos, nacionalidad").eq("id", id).maybeSingle();
  const cliente = resCliente.data as { id: string; nombre: string; apellidos: string | null; nacionalidad: string | null; fechaCaducidad?: string | null } | null;
  if (!cliente) notFound();

  const nombre = `${cliente.nombre} ${cliente.apellidos ?? ""}`.trim();

  const [{ data: expRows }, { data: facRows }] = await Promise.all([
    supabase.from("Expediente").select("id, referencia, tipo, estado, createdAt").eq("clienteId", id).order("createdAt", { ascending: false }),
    // Factura est dénormalisée par nom de client (pas de FK clienteId).
    supabase.from("Factura").select("id, numero, concepto, baseImponible, estado, fechaEmision").eq("clienteNombre", nombre).order("numero", { ascending: false }),
  ]);

  const expedientes = (expRows ?? []) as { id: string; referencia: string; tipo: string; estado: string; createdAt: string }[];
  const facturas = ((facRows ?? []) as { id: string; numero: string; concepto: string; baseImponible: number | string; estado: string; fechaEmision: string | null }[]).map((f) => ({
    id: f.id,
    numero: f.numero,
    concepto: f.concepto,
    base: Number(f.baseImponible),
    estado: f.estado as FacturaEstado,
    fecha: fmtFechaCorta(f.fechaEmision) ?? "—",
  }));

  const nacionalidad = cliente.nacionalidad ?? "—";
  const totalFacturado = facturas.filter((f) => f.estado !== "BORRADOR").reduce((s, f) => s + totalDe(f.base), 0);

  // Documentos sueltos del cliente (sin expediente). Defensivo: [] si falta la migración.
  let docsSueltos: DocSuelto[] = [];
  try {
    const { data: ds, error: eDs } = await supabase.from("DocumentoCliente").select("id, tipo, nombreArchivo, createdAt").eq("clienteId", id).order("createdAt", { ascending: false });
    if (!eDs) docsSueltos = (ds ?? []) as unknown as DocSuelto[];
  } catch { /* tabla aún no migrada */ }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Clientes")}
      </Link>

      {/* En-tête */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-aproba-100 text-lg font-semibold text-aproba-700">{initials(nombre)}</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{nombre}</h1>
            <p className="text-slate-500">{nacionalidad}</p>
          </div>
        </div>
        <div className="hidden gap-6 text-center sm:flex">
          <div><p className="text-2xl font-bold tracking-tightest text-slate-900">{expedientes.length}</p><p className="text-xs text-slate-400">{t("expedientes")}</p></div>
          <div><p className="text-2xl font-bold tracking-tightest text-slate-900">{eur(totalFacturado)}</p><p className="text-xs text-slate-400">{t("facturado")}</p></div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Expedientes */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Expedientes")} ({expedientes.length})</h2>
            <Link href="/app/expedientes/nuevo" className="text-sm font-semibold text-aproba-700 hover:underline">{t("+ Nuevo")}</Link>
          </div>
          <div className="space-y-1">
            {expedientes.map((e) => {
              const meta = ESTADO_META[e.estado as keyof typeof ESTADO_META] ?? { ...ESTADO_FALLBACK, label: e.estado };
              return (
                <Link key={e.id} href={`/app/expedientes/${e.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-cream-50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{t(TIPO_LABEL[e.tipo] ?? e.tipo)}</p>
                    <p className="font-mono text-xs text-slate-400">{e.referencia}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span>
                </Link>
              );
            })}
            {expedientes.length === 0 && <p className="px-2 text-sm text-slate-400">{t("Sin expedientes.")}</p>}
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
    </div>
  );
}
