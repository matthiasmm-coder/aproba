// Esqueleto de Ajustes: la página espera 5 fetches (servicios, avisos, cuentas,
// equipo, despacho) — sin esto, navegar a Ajustes se siente «congelado».
export default function AjustesLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-slate-200" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-slate-100" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:px-6 sm:py-5">
            <div className="h-10 w-10 rounded-xl bg-aproba-50" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-48 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-72 max-w-full rounded bg-slate-100" />
            </div>
            <div className="h-5 w-5 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
