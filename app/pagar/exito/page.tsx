import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchStripeKeyDeWorkspace, stripeConClave, marcarFacturaPagada } from "@/lib/cobros-tarjeta";
import { enviarConfirmacionPago } from "@/lib/notificaciones";

export const metadata = { title: "Pago recibido" };
export const dynamic = "force-dynamic";

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// Página de retorno tras pagar con tarjeta. Verifica la sesión de Stripe (clave de la
// gestoría) y, si está pagada, marca la factura como PAGADA (idempotente). Si el
// webhook/redirección no llegara, el gestor siempre puede marcarla a mano.
export default async function PagoExito({ searchParams }: { searchParams: Promise<{ f?: string; s?: string }> }) {
  const { f, s } = await searchParams;
  let pagada = false, numero = "", total = 0, gestoria = "tu gestoría";

  if (f) {
    const admin = createSupabaseAdmin();
    const { data: fac } = await admin
      .from("Factura")
      .select("id, workspaceId, expedienteId, numero, total, estado, Workspace(nombre)")
      .eq("id", f)
      .maybeSingle();
    if (fac) {
      numero = String(fac.numero);
      total = Number(fac.total);
      gestoria = uno(fac.Workspace as { nombre: string | null } | { nombre: string | null }[])?.nombre ?? gestoria;
      if (fac.estado === "PAGADA") {
        pagada = true;
      } else if (s) {
        const key = await fetchStripeKeyDeWorkspace(admin, String(fac.workspaceId));
        if (key) {
          try {
            const sess = await stripeConClave(key).checkout.sessions.retrieve(s);
            if (sess.payment_status === "paid") {
              const r = await marcarFacturaPagada(admin, String(fac.id), "TARJETA");
              pagada = true;
              // Confirmación al cliente (sin IBAN) solo en la transición real a pagada.
              if (r === "nuevo" && fac.expedienteId) {
                const h = await headers();
                const host = h.get("x-forwarded-host") ?? h.get("host");
                const proto = h.get("x-forwarded-proto") ?? "https";
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || (host ? `${proto}://${host}` : undefined);
                await enviarConfirmacionPago(admin, { expedienteId: String(fac.expedienteId), numero, total, metodo: "TARJETA", baseUrl });
              }
            }
          } catch { /* verificación fallida → se muestra estado pendiente */ }
        }
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6f4] p-6">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#e6eae8] bg-white">
        <div className="h-1 bg-aproba-600" />
        <div className="px-7 py-9 text-center">
          {pagada ? (
            <>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF5] text-aproba-700">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">¡Pago recibido!</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
                Hemos registrado el pago de la factura <strong className="text-slate-700">{numero}</strong>
                {total ? <> por <strong className="text-slate-700">{eur(total)}</strong></> : null}. {gestoria} continuará con tu trámite.
              </p>
            </>
          ) : (
            <>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              </span>
              <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Estamos confirmando tu pago</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
                Si el cobro se ha completado, {gestoria} lo verá reflejado en breve. No es necesario que hagas nada más.
              </p>
            </>
          )}
          <p className="mt-7 text-xs text-slate-400">
            Con la tecnología de <span className="font-bold text-aproba-600">α</span> <span className="font-semibold text-slate-500">aproba</span>
          </p>
        </div>
      </div>
    </main>
  );
}
