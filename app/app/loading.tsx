// Skeleton global de /app: cada clic de la sidebar daba 1-3 s de silencio total
// (server components sin feedback). Un pulso neutro basta para que se sienta vivo.
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-100" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded bg-slate-100" />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />)}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}
