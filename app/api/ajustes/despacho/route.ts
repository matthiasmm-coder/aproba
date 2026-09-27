import { mandatoConsejoValido } from "@/lib/mandato-modelos";
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

  // Carpetas del catálogo (Workspace.temas JSONB): rama propia, escribe SOLO su columna.
  if (str("soloTemas") === "1") {
    let temas: unknown;
    try { temas = JSON.parse(str("temas") || "[]"); } catch { temas = null; }
    if (!Array.isArray(temas) || temas.length > 200) {
      return NextResponse.json({ error: "Carpetas inválidas." }, { status: 400 });
    }
    const limpio = temas
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x, i) => ({
        id: String(x.id ?? "").slice(0, 40),
        nombre: String(x.nombre ?? "").trim().slice(0, 60),
        parentId: x.parentId ? String(x.parentId).slice(0, 40) : null,
        orden: Number.isFinite(Number(x.orden)) ? Number(x.orden) : i,
        // Acceso por persona: lista de userId. Vacía = toda la gestoría.
        usuarios: Array.isArray(x.usuarios) ? x.usuarios.map((u) => String(u).slice(0, 64)).filter(Boolean).slice(0, 50) : [],
      }))
      .filter((c) => c.id && c.nombre);
    const { error: eT } = await r.admin.from("Workspace").update({ temas: limpio }).eq("id", r.workspaceId);
    if (eT) {
      const falta = /temas|schema cache|column/i.test(eT.message);
      return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/temas-carpetas.sql en Supabase." : eT.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Packs de servicios (Workspace.packs JSONB): rama propia, escribe SOLO su columna.
  // El antiguo interruptor global «ocultar precios» (soloOcultarPrecios) se retiró:
  // ahora es ServicioConfig.precioOculto por servicio (supabase/servicios-pro.sql).
  if (str("soloPacks") === "1") {
    let packs: unknown;
    try { packs = JSON.parse(str("packs") || "[]"); } catch { packs = null; }
    if (!Array.isArray(packs) || packs.length > 50) {
      return NextResponse.json({ error: "Packs inválidos." }, { status: 400 });
    }
    const limpio = packs
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({
        id: String(x.id ?? "").slice(0, 40),
        nombre: String(x.nombre ?? "").trim().slice(0, 120),
        desc: String(x.desc ?? "").trim().slice(0, 500),
        servicioIds: Array.isArray(x.servicioIds) ? x.servicioIds.map((s) => String(s).slice(0, 60)).filter(Boolean).slice(0, 20) : [],
        precioDesde: Math.max(0, Math.min(999999, Number(x.precioDesde) || 0)), // legado
        descuentoPct: Math.max(0, Math.min(100, Number(x.descuentoPct) || 0)),
        porcentaje: Math.max(0, Math.min(100, Number(x.porcentaje) || 0)),
        porcentajeSobre: String(x.porcentajeSobre ?? "").trim().slice(0, 120),
        precioOculto: Boolean(x.precioOculto),
        categoria: String(x.categoria ?? "").trim().slice(0, 60),
      }))
      .filter((p) => p.id && p.nombre);
    const { error: ePk } = await r.admin.from("Workspace").update({ packs: limpio }).eq("id", r.workspaceId);
    if (ePk) {
      const falta = /packs|schema cache|column/i.test(ePk.message);
      return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/servicios-pro.sql en Supabase." : ePk.message }, { status: 500 });
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
      // Opciones 06/08 (portal-encargo-opciones.sql). El textarea llega tal cual; se
      // recorta y se vacía a NULL para que la hoja sepa cuándo usar la lista automática.
      encargoFormasPago: str("encargoFormasPago").slice(0, 1200).trim() || null,
    };

    // Modelo oficial del Consejo (supabase/mandato-consejo.sql): se guarda aparte para que,
    // sin la migración, el resto del bloque se guarde igual y el aviso sea exacto.
    let consejo: ReturnType<typeof mandatoConsejoValido> | undefined;
    if (form.has("mandatoConsejo")) {
      try { consejo = mandatoConsejoValido(JSON.parse(str("mandatoConsejo"))); } catch { consejo = null; }
    }

    const { error: eEnc } = await r.admin.from("Workspace").update(patchEncargo).eq("id", r.workspaceId);
    // El interruptor del MANDATO (supabase/mandato-activo.sql, 27/09/2026), aparte por la
    // misma razón: sin la migración, la hoja y lo demás se guardan igual.
    if (!eEnc && form.has("mandatoActivo")) {
      const { error: eMa } = await r.admin.from("Workspace").update({ mandatoActivo: str("mandatoActivo") === "1" }).eq("id", r.workspaceId);
      if (eMa) {
        const falta = /mandatoActivo|schema cache|column/i.test(eMa.message);
        return NextResponse.json({ error: falta ? "Se ha guardado todo menos el interruptor de los mandatos: falta la migración supabase/mandato-activo.sql en Supabase." : eMa.message }, { status: falta ? 409 : 500 });
      }
    }
    if (!eEnc && consejo !== undefined) {
      const { error: eCon } = await r.admin.from("Workspace").update({ mandatoConsejo: consejo }).eq("id", r.workspaceId);
      if (eCon) {
        const falta = /mandatoConsejo|schema cache|column/i.test(eCon.message);
        return NextResponse.json({ error: falta ? "Se ha guardado todo menos el mandato del Consejo: falta la migración supabase/mandato-consejo.sql en Supabase." : eCon.message }, { status: falta ? 409 : 500 });
      }
    }
    if (eEnc) {
      const faltaNuevas = /encargoFormasPago|portalOcultarPrecios/i.test(eEnc.message);
      const falta = /hojaEncargoActiva|mandatario|schema cache|column/i.test(eEnc.message);
      return NextResponse.json({ error: faltaNuevas
        ? "Falta la migración: ejecuta supabase/portal-encargo-opciones.sql en Supabase."
        : falta ? "Falta la migración: ejecuta supabase/hoja-encargo.sql en Supabase." : eEnc.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, string | null> = {
    nombre: str("nombre") || "Mi despacho",
    nif: str("nif") || null,
    domicilio: str("domicilio") || null,
    domicilioActividad: str("domicilioActividad") || null,
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

  let { error } = await r.admin.from("Workspace").update(patch).eq("id", r.workspaceId);
  // Sin la migración del domicilio de actividad, se guarda el resto igual (no se pierde nada).
  if (error && /domicilioActividad/i.test(error.message)) {
    const { domicilioActividad: _omit, ...sinActividad } = patch; void _omit;
    ({ error } = await r.admin.from("Workspace").update(sinActividad).eq("id", r.workspaceId));
  }
  if (error) {
    const falta = /logoUrl|schema cache|column/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración del logo (supabase/workspace-logo.sql)." : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, logoUrl: patch.logoUrl ?? null });
}
