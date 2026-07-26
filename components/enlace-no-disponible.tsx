import { AprobaMark } from "@/components/logo";

// Pantalla para enlaces de portal que ya no existen (expediente borrado, enlace viejo
// en un email antiguo…). La ve el CLIENTE FINAL: nada de «Ir a la app» ni jerga de
// gestor — solo qué hacer ahora. Multilingüe estático (aquí no hay cliente al que
// leerle el idioma: el token no resuelve).
export function EnlaceNoDisponible() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream-50 px-6 py-10 text-center">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">🔗</span>
      <h1 className="mt-6 text-xl font-bold tracking-tightest text-slate-900">Este enlace ya no está disponible</h1>
      <p className="mt-2 max-w-md leading-relaxed text-slate-600">
        Puede que el trámite haya terminado o que el enlace haya cambiado.
        Pide a tu gestoría un enlace nuevo.
      </p>
      <div className="mt-5 max-w-md space-y-1 text-sm leading-relaxed text-slate-400">
        <p>This link is no longer available — ask your advisor for a new one.</p>
        <p>Ce lien n&rsquo;est plus disponible — demandez un nouveau lien à votre conseiller.</p>
        <p dir="rtl" lang="ar">هذا الرابط لم يعد متاحاً — اطلب من مكتبك رابطاً جديداً.</p>
      </div>
      <p className="mt-10 flex items-center justify-center gap-1 text-xs text-slate-400">con <AprobaMark size={13} /> aproba</p>
    </div>
  );
}
