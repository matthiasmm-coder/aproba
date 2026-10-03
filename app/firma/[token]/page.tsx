import type { Metadata } from "next";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sobrePorToken } from "@/lib/firma/servicio";
import { sobrePublico } from "@/lib/firma/publico";
import { FirmaCliente } from "@/components/firma/firma-cliente";

// PÁGINA DE FIRMA del cliente (lib/firma): pública por enlace secreto, nunca indexada. La
// apertura NO se anota aquí (los escáneres de correo cargan la página): la anota el navegador.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Firma de documentos", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();
  const s = await sobrePorToken(admin, token);
  return <FirmaCliente token={token} inicial={s ? await sobrePublico(admin, s) : null} />;
}
