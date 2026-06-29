export const metadata = { title: "Pago no completado" };

// Página de retorno cuando el cliente cancela el pago con tarjeta o si algo falla.
// El parámetro ?m da el motivo (informativo); siempre queda la opción de transferencia.
const MOTIVO: Record<string, string> = {
  sintarjeta: "El pago con tarjeta no está disponible para esta factura. Puedes pagar por transferencia con los datos de tu email.",
  nofactura: "No hemos encontrado la factura. Revisa el enlace de tu email.",
  stripe: "No hemos podido iniciar el pago con tarjeta. Inténtalo de nuevo o paga por transferencia.",
  falta: "Falta la referencia de la factura. Vuelve a tu email e inténtalo de nuevo.",
};

export default async function PagoCancelado({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const texto = (m && MOTIVO[m]) || "No se ha completado el pago. Puedes volver a intentarlo desde tu email o pagar por transferencia bancaria.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6f4] p-6">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#e6eae8] bg-white">
        <div className="h-1 bg-slate-300" />
        <div className="px-7 py-9 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </span>
          <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Pago no completado</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{texto}</p>
          <p className="mt-7 text-xs text-slate-400">
            Con la tecnología de <span className="font-bold text-aproba-600">α</span> <span className="font-semibold text-slate-500">aproba</span>
          </p>
        </div>
      </div>
    </main>
  );
}
