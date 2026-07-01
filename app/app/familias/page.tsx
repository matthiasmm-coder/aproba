import Link from "next/link";
import { fetchFamilias } from "@/lib/data/familias";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Familias" };

export default async function FamiliasPage() {
  const t = await getT();
  const familias = await fetchFamilias();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Familias")}</h1>
          <p className="mt-1 text-slate-500">{t("Agrupa a los miembros de una familia y gestiona sus expedientes juntos.")}</p>
        </div>
        <Link href="/app/familias/nueva" className="shrink-0 rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">+ {t("Nueva familia")}</Link>
      </div>

      {familias.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <p className="text-sm text-slate-500">{t("Aún no hay familias.")}</p>
          <Link href="/app/familias/nueva" className="mt-3 inline-block text-sm font-semibold text-aproba-700 hover:underline">{t("Crear la primera →")}</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {familias.map((f) => (
            <Link key={f.id} href={`/app/familias/${f.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition hover:border-aproba-300 hover:shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-aproba-50 text-aproba-700">
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>
                </span>
                <span className="font-medium text-slate-900">{f.nombre}</span>
              </div>
              <span className="text-sm text-slate-400">{f.miembros} {f.miembros === 1 ? t("miembro") : t("miembros")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
