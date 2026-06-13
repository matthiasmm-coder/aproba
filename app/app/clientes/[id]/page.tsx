import Link from "next/link";
import { notFound } from "next/navigation";
import { EXPEDIENTES } from "@/lib/mock-data";
import { ESTADO_META } from "@/lib/types";
import { FACTURAS, FACTURA_ESTADO_META, eur, totalDe } from "@/lib/facturas";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2);
}

export default async function ClienteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nombre = decodeURIComponent(id);

  const expedientes = EXPEDIENTES.filter((e) => e.clienteNombre === nombre);
  const facturas = FACTURAS.filter((f) => f.cliente === nombre);
  if (expedientes.length === 0 && facturas.length === 0) notFound();

  const nacionalidad = expedientes[0]?.clienteNacionalidad ?? "—";
  const totalFacturado = facturas.filter((f) => f.estado !== "BORRADOR").reduce((s, f) => s + totalDe(f.base), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Clientes
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
          <div><p className="text-2xl font-bold tracking-tightest text-slate-900">{expedientes.length}</p><p className="text-xs text-slate-400">expedientes</p></div>
          <div><p className="text-2xl font-bold tracking-tightest text-slate-900">{eur(totalFacturado)}</p><p className="text-xs text-slate-400">facturado</p></div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Expedientes */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Expedientes ({expedientes.length})</h2>
            <Link href="/app/expedientes/nuevo" className="text-sm font-semibold text-aproba-700 hover:underline">+ Nuevo</Link>
          </div>
          <div className="space-y-1">
            {expedientes.map((e) => {
              const meta = ESTADO_META[e.estado];
              return (
                <Link key={e.id} href={`/app/expedientes/${e.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-cream-50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{e.tipoLabel}</p>
                    <p className="font-mono text-xs text-slate-400">{e.referencia}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{meta.label}</span>
                </Link>
              );
            })}
            {expedientes.length === 0 && <p className="px-2 text-sm text-slate-400">Sin expedientes.</p>}
          </div>
        </div>

        {/* Facturas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Facturas ({facturas.length})</h2>
            <Link href="/app/facturas/nueva" className="text-sm font-semibold text-aproba-700 hover:underline">+ Nueva</Link>
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
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{meta.label}</span>
                </Link>
              );
            })}
            {facturas.length === 0 && <p className="px-2 text-sm text-slate-400">Sin facturas.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
