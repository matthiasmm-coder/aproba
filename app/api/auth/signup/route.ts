import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Inscription d'un gestor / avocat.
// On crée l'utilisateur DÉJÀ confirmé (service_role, email_confirm:true) pour un
// accès instantané sans dépendre d'un SMTP : le client enchaîne signInWithPassword,
// puis l'onboarding (nom du despacho + plan). La vérification d'email pourra être
// réactivée plus tard (envoi d'un lien de confirmation avant le premier accès).
export async function POST(req: Request) {
  let body: { nombre?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const nombre = (body.nombre ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (nombre.length < 2) return NextResponse.json({ error: "Indica tu nombre." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Email no válido." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });

  const admin = createSupabaseAdmin();

  // Email déjà pris ?
  const { data: existentes } = await admin.from("User").select("id").eq("email", email).limit(1);
  if (existentes && existentes.length > 0) {
    return NextResponse.json({ error: "Ya existe una cuenta con este email. Inicia sesión." }, { status: 409 });
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (error) {
    const dup = /already.*(registered|exists)|duplicate/i.test(error.message);
    return NextResponse.json(
      { error: dup ? "Ya existe una cuenta con este email. Inicia sesión." : error.message },
      { status: dup ? 409 : 400 },
    );
  }

  // Le trigger handle_new_user a créé la ligne public.User. La session est ouverte
  // côté client (signInWithPassword) pour éviter d'exposer des jetons ici.
  return NextResponse.json({ ok: true });
}
