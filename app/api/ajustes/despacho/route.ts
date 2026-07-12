import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";

// Datos de facturación del despacho (encabezado de la factura) + logo. Solo admins.
// FormData: nombre, nif, domicilio, emailFacturacion + opcional file (logo). El logo va
// al bucket público `avatares` (path logo-<ws>.<ext>) y la URL se guarda en Workspace.logoUrl.

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 2 * 1024 * 1024;

async function adminWs() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return { error: "No perteneces a ningún despacho.", status: 403 as const };
  if (!puedeGestionarEquipo(mem.role as string)) return { error: "Solo un administrador puede editar los datos de facturación.", status: 403 as const };
  return { admin, workspaceId: mem.workspaceId as string };
}

export async function POST(req: Request) {
  const r = await adminWs();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Petición inválida." }, { status: 400 });

  const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v.trim() : ""; };

  // Modo «solo canal»: el selector Email/WhatsApp/Ambos de Notificaciones al cliente
  // guarda ÚNICAMENTE Workspace.canalAvisos. Requiere supabase/whatsapp-canal.sql.
  if (str("soloCanal") === "1") {
    const canal = str("canalAvisos");
    if (!["EMAIL", "WHATSAPP", "AMBOS"].includes(canal)) {
      return NextResponse.json({ error: "Canal inválido." }, { status: 400 });
    }
    const { error: eCanal } = await r.admin.from("Workspace").update({ canalAvisos: canal }).eq("id", r.workspaceId);
    if (eCanal) {
      const falta = /canalAvisos|schema cache|column/i.test(eCanal.message);
      return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/whatsapp-canal.sql en Supabase." : eCanal.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Modo «solo encargo»: el bloque Hoja de encargo/mandato guarda ÚNICAMENTE sus
  // campos (si no, machacaría nombre/NIF con vacíos). Requiere supabase/hoja-encargo.sql.
  if (str("soloEncargo") === "1") {
    const patchEncargo: Record<string, string | boolean | null> = {
      hojaEncargoActiva: str("hojaEncargoActiva") === "1",
      mandatarioNombre: str("mandatarioNombre") || null,
      mandatarioDni: str("mandatarioDni") || null,
      mandatarioColegiado: str("mandatarioColegiado") || null,
      mandatarioColegio: str("mandatarioColegio") || null,
    };
    const { error: eEnc } = await r.admin.from("Workspace").update(patchEncargo).eq("id", r.workspaceId);
    if (eEnc) {
      const falta = /hojaEncargoActiva|mandatario|schema cache|column/i.test(eEnc.message);
      return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/hoja-encargo.sql en Supabase." : eEnc.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, string | null> = {
    nombre: str("nombre") || "Mi despacho",
    nif: str("nif") || null,
    domicilio: str("domicilio") || null,
    emailFacturacion: str("emailFacturacion") || null,
  };

  // Logo opcional.
  const file = form.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext = TIPOS[file.type];
    if (!ext) return NextResponse.json({ error: "Logo no soportado (JPG, PNG o WebP)." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "El logo supera los 2 MB." }, { status: 400 });
    const path = `logo-${r.workspaceId}.${ext}`;
    const { error: eUp } = await r.admin.storage.from("avatares").upload(path, file, { upsert: true, contentType: file.type });
    if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });
    const { data: pub } = r.admin.storage.from("avatares").getPublicUrl(path);
    patch.logoUrl = `${pub.publicUrl}?v=${Date.now()}`;
  } else if (str("quitarLogo") === "1") {
    patch.logoUrl = null;
  }

  const { error } = await r.admin.from("Workspace").update(patch).eq("id", r.workspaceId);
  if (error) {
    const falta = /logoUrl|schema cache|column/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración del logo (supabase/workspace-logo.sql)." : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, logoUrl: patch.logoUrl ?? null });
}
