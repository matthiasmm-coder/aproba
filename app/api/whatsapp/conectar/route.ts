import { NextResponse, after } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { canjearCodigo, suscribirApp, telefonosDelWaba, sincronizar, cifrarToken, metaDisponible, cuentaDelWorkspace } from "@/lib/whatsapp-meta";
import { asegurarPlantillas } from "@/lib/whatsapp-plantillas";

export const runtime = "nodejs";
export const maxDuration = 60;
const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

// «CONECTAR MI WHATSAPP» (Ajustes › Integraciones) — fin del Embedded Signup de Meta:
// el navegador manda el código (TTL 30 s) + waba_id (+ phone_number_id si Meta lo dio) →
// aquí se canjea por el token de sistema del negocio (nunca sale del servidor, cifrado en
// base), la app se suscribe al WABA, se lee el número y, en coexistencia, se piden las
// sincronizaciones únicas (contactos, historial) y se crean las plantillas de Aproba.
async function contexto() {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: fail("No autenticado.", 401) };
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return { error: fail("No perteneces a ningún despacho.", 403) };
  if (!puedeGestionarEquipo(mem.role as string)) return { error: fail("Solo un administrador puede conectar el WhatsApp del despacho.", 403) };
  return { admin, user, ws: mem.workspaceId as string };
}

export async function GET() {
  const c = await contexto(); if ("error" in c) return c.error;
  const { data } = await c.admin.from("WhatsAppCuenta").select("id, oficinaId, telefono, nombreVerificado, coexistencia, estado, error, plantillas, sincronizadoAt, createdAt").eq("workspaceId", c.ws).order("createdAt");
  return NextResponse.json({ disponible: metaDisponible(), cuentas: data ?? [] });
}

export async function POST(req: Request) {
  if (!metaDisponible()) return fail("WhatsApp no está configurado en la plataforma todavía.", 503);
  const c = await contexto(); if ("error" in c) return c.error;
  const body = (await req.json().catch(() => ({}))) as { code?: unknown; wabaId?: unknown; phoneNumberId?: unknown; oficinaId?: unknown; coexistencia?: unknown };
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const wabaId = typeof body.wabaId === "string" ? body.wabaId.trim() : "";
  if (!code || !wabaId) return fail("Faltan el código o el WABA del alta.");
  const oficinaId = typeof body.oficinaId === "string" && body.oficinaId.trim() ? body.oficinaId.trim() : null;
  const coexistencia = body.coexistencia !== false;

  try {
    const { token, expiraEn } = await canjearCodigo(code);
    await suscribirApp(token, wabaId);
    const telefonos = await telefonosDelWaba(token, wabaId);
    const pedido = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
    const tel = (pedido && telefonos.find((t) => t.id === pedido)) || telefonos[0];
    if (!tel) return fail("Meta no devuelve ningún número en esa cuenta de WhatsApp Business.", 502);
    const ahora = new Date().toISOString();
    const fila = {
      id: crypto.randomUUID(), workspaceId: c.ws, oficinaId, wabaId, phoneNumberId: tel.id, telefono: tel.display_phone_number ?? null, nombreVerificado: tel.verified_name ?? null,
      tokenCifrado: cifrarToken(token), tokenExpiraAt: expiraEn ? new Date(Date.now() + expiraEn * 1000).toISOString() : null,
      coexistencia: coexistencia || Boolean(tel.is_on_biz_app), estado: "CONECTADA", error: null, updatedAt: ahora,
    };
    // Reconexión del mismo número: se sustituye la fila (token nuevo), no se duplica.
    const { error } = await c.admin.from("WhatsAppCuenta").upsert(fila, { onConflict: "phoneNumberId" });
    if (error) return fail(/relation|schema cache|does not exist/i.test(error.message) ? "Falta la migración supabase/whatsapp-meta.sql." : error.message, 500);
    after(async () => {
      try {
        if (fila.coexistencia) { await sincronizar(token, tel.id, "smb_app_state_sync"); await sincronizar(token, tel.id, "history"); await c.admin.from("WhatsAppCuenta").update({ sincronizadoAt: new Date().toISOString() }).eq("phoneNumberId", tel.id); }
      } catch (e) { console.error("[whatsapp conectar] sincronización:", e instanceof Error ? e.message : e); }
      try { await asegurarPlantillas(c.admin, token, wabaId, tel.id); } catch (e) { console.error("[whatsapp conectar] plantillas:", e instanceof Error ? e.message : e); }
    });
    return NextResponse.json({ ok: true, telefono: tel.display_phone_number, nombre: tel.verified_name ?? null, coexistencia: fila.coexistencia });
  } catch (e) {
    return fail(`No se pudo conectar: ${e instanceof Error ? e.message : "error"}`, 502);
  }
}

// Desconectar: la fila queda DESCONECTADA (los mensajes ya archivados no se tocan) y el
// token se borra. El número sigue funcionando en la app WhatsApp Business del gestor.
export async function DELETE(req: Request) {
  const c = await contexto(); if ("error" in c) return c.error;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const cuenta = id ? null : await cuentaDelWorkspace(c.admin, c.ws);
  const objetivo = id || cuenta?.id;
  if (!objetivo) return fail("No hay ningún WhatsApp conectado.", 404);
  const { error } = await c.admin.from("WhatsAppCuenta").update({ estado: "DESCONECTADA", tokenCifrado: "", updatedAt: new Date().toISOString() }).eq("id", objetivo).eq("workspaceId", c.ws);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
