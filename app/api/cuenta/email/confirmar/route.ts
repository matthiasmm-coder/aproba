import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, stripeDisponible } from "@/lib/billing";
import { aplicarCambioEmail, htmlAviso, leerCambio, normalizarEmail } from "@/lib/cambio-email";

// Aplica el cambio de email pedido en Ajustes. Sin sesión a propósito: el enlace se abre a
// menudo en otro dispositivo (el móvil). El token firmado dice quién y a qué email; haberlo
// recibido en el buzón nuevo prueba que es suyo.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { t?: string };
  const cambio = leerCambio(String(body.t ?? ""));
  if (!cambio) return NextResponse.json({ error: "enlace" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const r = await aplicarCambioEmail(cambio, {
    leerUsuario: async (id) => {
      const { data } = await admin.from("User").select("email").eq("id", id).maybeSingle();
      return data ? { email: String(data.email) } : null;
    },
    emailEnUso: async (email, exceptoId) => {
      const { data } = await admin.from("User").select("id").eq("email", email).neq("id", exceptoId).limit(1);
      return Boolean(data?.length);
    },
    cambiarEmailAuth: async (id, email) => {
      const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
      return error ? error.message : null;
    },
    cambiarEmailTabla: async (id, email) => {
      const { error } = await admin.from("User").update({ email }).eq("id", id);
      return error ? error.message : null;
    },
    // Los recibos de Stripe van al email del cliente: si era el email de acceso del titular
    // (así lo crea el checkout), lo sigue. Un email de facturación distinto no se toca.
    sincronizarStripe: async (id, anterior, nuevo) => {
      if (!stripeDisponible()) return;
      const { data: mems } = await admin.from("Membership").select("workspaceId").eq("userId", id).eq("role", "OWNER");
      for (const m of mems ?? []) {
        const { data: sub } = await admin.from("Subscription").select("stripeCustomerId").eq("workspaceId", m.workspaceId).maybeSingle();
        const clienteId = sub?.stripeCustomerId as string | undefined;
        if (!clienteId) continue;
        const stripe = getStripe();
        const cliente = await stripe.customers.retrieve(clienteId);
        if (!("deleted" in cliente && cliente.deleted) && normalizarEmail(cliente.email) === anterior) {
          await stripe.customers.update(clienteId, { email: nuevo });
        }
      }
    },
    avisarAnterior: async (anterior, nuevo) => {
      if (!process.env.RESEND_API_KEY) return;
      const from = `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: anterior, subject: "Tu email de acceso a Aproba ha cambiado",
        html: htmlAviso(nuevo), text: `El email de acceso de tu cuenta de Aproba ha cambiado a ${nuevo}. Si no has sido tú, escríbenos.`,
      });
    },
  });
  if (!r.ok) return NextResponse.json({ error: r.codigo }, { status: r.status });
  return NextResponse.json({ ok: true, email: r.email });
}
