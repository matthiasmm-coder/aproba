import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Pago no completado" };
export const dynamic = "force-dynamic";

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// Página de retorno cuando el cliente cancela el pago con tarjeta o si algo falla.
// NO es un callejón sin salida: con ?f= resolvemos la factura y ofrecemos aquí mismo
// el plan B completo — pagar por transferencia (IBAN + concepto), reintentar con
// tarjeta, o volver a la solicitud. El parámetro ?m da el motivo (informativo).
const MOTIVO: Record<string, string> = {
  sintarjeta: "El pago con tarjeta no está disponible para esta factura.",
  nofactura: "No hemos encontrado la factura. Revisa el enlace de tu email.",
  stripe: "No hemos podido iniciar el pago con tarjeta.",
  falta: "Falta la referencia de la factura. Vuelve a tu email e inténtalo de nuevo.",
};

// OJO seguridad: esta página se abre con el uuid de factura (?f=), un secreto de
// PAGO que viaja en query string. NUNCA debe devolver el portalToken (/j) — sería
// escalar un secreto menor al secreto maestro del cliente (ficha completa, docs).
type Fac = {
  id: string; workspaceId: string; numero: string; total: number; estado: string;
  Workspace: { nombre: string | null } | { nombre: string | null }[] | null;
};
type Cuenta = { titular: string; iban: string; banco: string | null };

export default async function PagoCancelado({ searchParams }: { searchParams: Promise<{ m?: string; f?: string }> }) {
  const { m, f } = await searchParams;
  const texto = (m && MOTIVO[m]) || "No se ha completado el pago con tarjeta. No te preocupes: no se te ha cobrado nada.";

  // Con la factura resuelta ofrecemos el plan B completo; sin ella, el aviso genérico.
  let fac: Fac | null = null;
  let cuenta: Cuenta | null = null;
  if (f?.trim()) {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("Factura")
      .select("id, workspaceId, numero, total, estado, Workspace(nombre)")
      .eq("id", f.trim())
      .maybeSingle();
    fac = (data as Fac | null) ?? null;
    // Ya pagada (volvió atrás DESPUÉS de pagar): la verdad es «pago recibido», no «cancelado».
    if (fac?.estado === "PAGADA") redirect(`/pagar/exito?f=${fac.id}`);
    // Solo una factura aún cobrable enseña el plan B (anulada/otro estado → aviso genérico).
    if (fac && fac.estado !== "EMITIDA") fac = null;
    if (fac) {
      const { data: cuentas } = await admin
        .from("CuentaBancaria")
        .select("titular, iban, banco")
        .eq("workspaceId", fac.workspaceId)
        .eq("activa", true)
        .limit(1);
      cuenta = ((cuentas?.[0] as unknown) as Cuenta | undefined) ?? null;
    }
  }

  const gestoria = uno(fac?.Workspace)?.nombre ?? "tu gestoría";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6f4] p-6">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#e6eae8] bg-white">
        <div className="h-1 bg-slate-300" />
        <div className="px-7 py-8">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </span>
            <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Pago no completado</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{texto}</p>
          </div>

          {fac && (
            <>
              <div className="mt-6 flex items-center justify-between rounded-xl bg-[#f8faf9] px-4 py-3 text-sm">
                <span className="text-slate-500">Factura <span className="font-semibold text-slate-700">{fac.numero}</span></span>
                <span className="font-bold text-slate-900">{eur(Number(fac.total))}</span>
              </div>

              {cuenta && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pagar por transferencia</p>
                  <dl className="mt-2.5 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">Titular</dt><dd className="text-right font-medium text-slate-800">{cuenta.titular}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">IBAN</dt><dd className="break-all text-right font-mono text-[13px] font-medium text-slate-800">{cuenta.iban}</dd></div>
                    {cuenta.banco && <div className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">Banco</dt><dd className="text-right font-medium text-slate-800">{cuenta.banco}</dd></div>}
                    <div className="flex justify-between gap-3"><dt className="shrink-0 text-slate-500">Concepto</dt><dd className="text-right font-medium text-slate-800">{fac.numero}</dd></div>
                  </dl>
                  <p className="mt-2.5 text-xs leading-relaxed text-slate-400">Estos datos están también en el email con tu factura.</p>
                </div>
              )}

              <div className="mt-5 space-y-2.5">
                <a href={`/api/pagos/checkout?f=${fac.id}`} className="flex w-full items-center justify-center gap-2 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                  Reintentar con tarjeta
                </a>
                <p className="pt-1 text-center text-xs leading-relaxed text-slate-400">Para volver a tu solicitud, usa el enlace que tienes en tu email o WhatsApp.</p>
              </div>
            </>
          )}

          {!fac && (
            <p className="mt-5 text-center text-sm text-slate-500">Puedes volver a intentarlo desde tu email o pagar por transferencia bancaria con los datos de la factura.</p>
          )}

          <p className="mt-7 text-center text-xs text-slate-400">
            {fac ? <>{gestoria} · </> : null}Con la tecnología de <span className="font-bold text-aproba-600">α</span> <span className="font-semibold text-slate-500">aproba</span>
          </p>
        </div>
      </div>
    </main>
  );
}
