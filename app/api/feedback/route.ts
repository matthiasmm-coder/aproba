import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Retours des cabinets testeurs (beta). Stocke en base (service_role, table
// verrouillée côté client) + notifie le fondateur par email (best-effort).
const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const CATS = ["bug", "idea", "otro"];
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mensaje?: string; categoria?: string; pagina?: string };
  const mensaje = (body.mensaje ?? "").trim();
  if (mensaje.length < 3) return fail("El mensaje está vacío.");
  if (mensaje.length > 4000) return fail("El mensaje es demasiado largo.");
  const categoria = CATS.includes(body.categoria ?? "") ? (body.categoria as string) : "otro";
  const pagina = typeof body.pagina === "string" ? body.pagina.slice(0, 300) : null;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  // Workspace de l'utilisateur (sous RLS), pour contextualiser le retour.
  const { data: mem } = await supabase.from("Membership").select("workspaceId, Workspace(nombre)").limit(1).maybeSingle();
  const ws = (mem as { workspaceId?: string } | null)?.workspaceId ?? null;
  const wsRel = (mem as { Workspace?: { nombre?: string } | { nombre?: string }[] } | null)?.Workspace;
  const wsNombre = (Array.isArray(wsRel) ? wsRel[0] : wsRel)?.nombre ?? null;

  // Écriture via service_role (la table Feedback est verrouillée côté client).
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("Feedback").insert({
    workspaceId: ws,
    userId: user.id,
    categoria,
    mensaje,
    pagina,
    userAgent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
  });
  if (error) {
    console.error("[feedback]", error.message);
    return fail("No se pudo guardar tu mensaje. Inténtalo de nuevo.", 500);
  }

  // Notification email au fondateur (ne bloque pas la réponse en cas d'échec).
  const notify = process.env.FEEDBACK_NOTIFY_EMAIL;
  if (notify && process.env.RESEND_API_KEY) {
    const from = `Aproba Feedback <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
    const html = `<p><strong>${categoria.toUpperCase()}</strong> · ${escapeHtml(wsNombre ?? "?")} · ${escapeHtml(user.email ?? user.id)}</p>`
      + `<p style="color:#64748b">Página: ${escapeHtml(pagina ?? "—")}</p>`
      + `<pre style="white-space:pre-wrap;font-family:inherit;background:#f8fafc;padding:12px;border-radius:8px">${escapeHtml(mensaje)}</pre>`;
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: notify,
        subject: `[Aproba feedback · ${categoria}] ${wsNombre ?? user.email ?? ""}`.trim(),
        html, text: `${categoria} — ${wsNombre ?? ""} — ${user.email ?? ""}\nPágina: ${pagina ?? "—"}\n\n${mensaje}`,
      });
    } catch (e) {
      console.error("[feedback email]", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true });
}
