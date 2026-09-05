import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sembrarEjemplo } from "@/lib/ejemplo";

// /app/ejemplo: garantiza que el despacho tiene su expediente de ejemplo y lleva a él.
// Es el destino del primer paso de la checklist en despachos anteriores al 05/09/2026,
// que no lo recibieron al darse de alta.
export const dynamic = "force-dynamic";

export default async function EjemploPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) redirect("/onboarding");
  let destino = "/app/expedientes";
  try {
    const r = await sembrarEjemplo(admin, mem.workspaceId as string, user.id);
    destino = `/app/expedientes/${r.id}`;
  } catch { /* sin ejemplo: al tablero */ }
  redirect(destino);
}
