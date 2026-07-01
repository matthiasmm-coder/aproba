import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchFamiliaDetalle, fetchDocumentosFamilia } from "@/lib/data/familias";
import { parentescoLabel } from "@/lib/familia";
import { getT } from "@/lib/app-lang";
import { AnadirMiembro } from "@/components/anadir-miembro";
import { DocumentosFamilia } from "@/components/documentos-familia";

export const metadata = { title: "Familia" };

export default async function FamiliaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const fam = await fetchFamiliaDetalle(id);
  if (!fam) notFound();
  const docs = await fetchDocumentosFamilia(id);

  const totalExp = fam.miembros.reduce((a, m) => a + m.expedientes.length, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/familias" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Familias")}
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-aproba-50 text-aproba-700">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{fam.nombre}</h1>
            <p className="text-sm text-slate-500">{fam.miembros.length} {fam.miembros.length === 1 ? t("miembro") : t("miembros")} · {totalExp} {totalExp === 1 ? t("expediente") : t("expedientes")}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {fam.miembros.map((m) => (
          <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="inline-block rounded-full bg-cream-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{parentescoLabel(m.parentesco) || t("Miembro")}</span>
                <p className="mt-1 font-semibold text-slate-900">{m.nombre}</p>
                {m.telefono && <p className="text-xs text-slate-400">{m.telefono}</p>}
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {m.expedientes.length > 0 ? m.expedientes.map((e) => (
                <Link key={e.id} href={`/app/expedientes/${e.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-cream-50/60 px-3 py-2 text-sm transition hover:border-aproba-300">
                  <span className="min-w-0 truncate"><span className="font-mono text-xs text-slate-500">{e.referencia}</span> <span className="text-slate-700">· {e.tipoLabel}</span></span>
                  <span className="shrink-0 text-xs font-medium text-aproba-700">{t(e.estadoLabel)} →</span>
                </Link>
              )) : (
                <p className="text-xs text-slate-400">{t("Sin expediente todavía.")}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <DocumentosFamilia familiaId={id} docs={docs} />

      <AnadirMiembro familiaId={id} />
    </div>
  );
}
