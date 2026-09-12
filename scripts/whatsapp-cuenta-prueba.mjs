// Alta MANUAL de un número de WhatsApp (Meta Cloud API) en un workspace de PRUEBAS.
//
// Sirve para el NÚMERO DE TEST de la app de Meta (developers.facebook.com › WhatsApp ›
// API Setup): no pasa por el Embedded Signup, Meta da directamente un token temporal
// (24 h) o de usuario de sistema, el phone_number_id y el waba_id. Este script hace lo
// que haría /api/whatsapp/conectar tras el canje: valida el token contra Graph, suscribe
// la app al WABA, guarda la cuenta con el token CIFRADO (misma receta que la app) y crea
// las plantillas de Aproba. A partir de ahí el webhook y los avisos funcionan igual que
// con un número real.
//
// Uso (las claves van por ENTORNO, nunca por argumentos ni en el chat):
//   WA_TOKEN=… WA_PHONE_NUMBER_ID=… WA_WABA_ID=… \
//   node --env-file=.env.local --loader ./scripts/ts-loader.mjs scripts/whatsapp-cuenta-prueba.mjs \
//     --ws <workspaceId> [--oficina <oficinaId>] [--sin-suscribir] [--sin-plantillas] [--expira-h 24]
//     [--probar +34XXXXXXXXX]   → envía la plantilla hello_world (viene aprobada con el número de test)
//     [--baja]                  → desconecta la cuenta (estado DESCONECTADA, token borrado)
//
// Solo escribe en los workspaces de prueba (Varent, Gestoría de Carmen, Gestoría Vallès);
// para cualquier otro hace falta --forzar (y saber lo que se hace).
import { createClient } from "@supabase/supabase-js";
import { cifrarToken, suscribirApp, telefonosDelWaba, enviarPlantilla, GRAPH_VERSION } from "@/lib/whatsapp-meta";
import { asegurarPlantillas, PLANTILLAS } from "@/lib/whatsapp-plantillas";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k) => args.includes(k);
const ws = opt("--ws");
if (!ws) { console.error("Falta --ws <workspaceId>"); process.exit(1); }

const env = (k) => (process.env[k] ?? "").trim();
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!env(k)) { console.error(`Falta ${k} (¿--env-file=.env.local?)`); process.exit(1); }
const admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

// Garde-fou: nunca un workspace de un cliente real.
const { data: wsRow, error: eWs } = await admin.from("Workspace").select("id, nombre").eq("id", ws).maybeSingle();
if (eWs || !wsRow) { console.error(`Workspace ${ws} no encontrado${eWs ? `: ${eWs.message}` : ""}`); process.exit(1); }
const DE_PRUEBA = /^(Varent|Gestoría de Carmen|Gestoría Vallès)$/i;
if (!DE_PRUEBA.test(wsRow.nombre ?? "") && !flag("--forzar")) { console.error(`«${wsRow.nombre}» no es un workspace de pruebas. Añade --forzar si de verdad quieres tocarlo.`); process.exit(1); }
console.log(`Workspace: ${wsRow.nombre} (${ws}) · Graph ${GRAPH_VERSION}`);

// ── Baja ──────────────────────────────────────────────────────────────────────
if (flag("--baja")) {
  const { data: filas } = await admin.from("WhatsAppCuenta").select("id, telefono, estado").eq("workspaceId", ws);
  const activas = (filas ?? []).filter((f) => f.estado === "CONECTADA");
  if (!activas.length) { console.log("No hay ninguna cuenta CONECTADA en este workspace."); process.exit(0); }
  for (const f of activas) {
    const { error } = await admin.from("WhatsAppCuenta").update({ estado: "DESCONECTADA", tokenCifrado: "", updatedAt: new Date().toISOString() }).eq("id", f.id);
    console.log(`${error ? "✗" : "✓"} ${f.telefono ?? f.id} → DESCONECTADA${error ? ` (${error.message})` : ""}`);
  }
  process.exit(0);
}

// ── Alta ──────────────────────────────────────────────────────────────────────
const token = env("WA_TOKEN"), phoneNumberId = env("WA_PHONE_NUMBER_ID"), wabaId = env("WA_WABA_ID");
if (!token || !phoneNumberId || !wabaId) { console.error("Faltan WA_TOKEN, WA_PHONE_NUMBER_ID o WA_WABA_ID en el entorno."); process.exit(1); }
const oficinaId = opt("--oficina") ?? null;
if (oficinaId) {
  const { data: o } = await admin.from("Oficina").select("id, nombre").eq("id", oficinaId).eq("workspaceId", ws).maybeSingle();
  if (!o) { console.error(`Oficina ${oficinaId} no pertenece a este workspace.`); process.exit(1); }
  console.log(`Oficina: ${o.nombre}`);
}

// 1. El token vale y el número existe en ese WABA (misma llamada que la app tras el canje).
let telefonos;
try { telefonos = await telefonosDelWaba(token, wabaId); }
catch (e) { console.error(`✗ Graph rechaza el token o el WABA: ${e instanceof Error ? e.message : e}`); process.exit(1); }
const tel = telefonos.find((t) => t.id === phoneNumberId);
if (!tel) { console.error(`✗ El WABA ${wabaId} no contiene el número ${phoneNumberId}. Números vistos: ${telefonos.map((t) => `${t.id} (${t.display_phone_number})`).join(", ") || "ninguno"}`); process.exit(1); }
console.log(`✓ Número: ${tel.display_phone_number} · ${tel.verified_name ?? "(sin nombre verificado)"} · platform ${tel.platform_type ?? "?"} · calidad ${tel.quality_rating ?? "?"}${tel.is_on_biz_app ? " · en la app WhatsApp Business (coexistencia)" : ""}`);

// 2. Webhooks: la app de Aproba se suscribe al WABA (sin esto Meta no manda nada).
if (!flag("--sin-suscribir")) {
  try { const r = await suscribirApp(token, wabaId); console.log(`✓ App suscrita al WABA: ${JSON.stringify(r)}`); }
  catch (e) { console.error(`⚠ No se pudo suscribir la app al WABA (¿permiso whatsapp_business_management?): ${e instanceof Error ? e.message : e}`); }
}

// 3. Guardar la cuenta — token cifrado con la clave derivada del service_role, como en la app.
const expiraH = Number(opt("--expira-h") ?? "");
const ahora = new Date().toISOString();
const { data: previa } = await admin.from("WhatsAppCuenta").select("id").eq("phoneNumberId", phoneNumberId).maybeSingle();
const fila = {
  id: previa?.id ?? crypto.randomUUID(), workspaceId: ws, oficinaId, wabaId, phoneNumberId, telefono: tel.display_phone_number ?? null, nombreVerificado: tel.verified_name ?? null,
  tokenCifrado: cifrarToken(token), tokenExpiraAt: Number.isFinite(expiraH) && expiraH > 0 ? new Date(Date.now() + expiraH * 3600 * 1000).toISOString() : null,
  coexistencia: Boolean(tel.is_on_biz_app), estado: "CONECTADA", error: null, updatedAt: ahora,
};
const { error: eUp } = await admin.from("WhatsAppCuenta").upsert(fila, { onConflict: "phoneNumberId" });
if (eUp) { console.error(`✗ No se pudo guardar la cuenta: ${eUp.message}${/relation|schema cache|does not exist/i.test(eUp.message) ? " → falta ejecutar supabase/whatsapp-meta.sql" : ""}`); process.exit(1); }
console.log(`✓ Cuenta ${previa ? "actualizada" : "creada"} (${fila.id}) · estado CONECTADA${fila.tokenExpiraAt ? ` · token caduca ${fila.tokenExpiraAt}` : ""}`);

// 4. Plantillas de Aproba (aproba_aviso es/en/fr) — quedan PENDING hasta que Meta las apruebe.
if (!flag("--sin-plantillas")) {
  const estado = await asegurarPlantillas(admin, token, wabaId, phoneNumberId);
  for (const p of PLANTILLAS) console.log(`  plantilla ${p.name}/${p.language}: ${estado[`${p.name}:${p.language}`] ?? "?"}`);
  const otras = Object.entries(estado).filter(([k]) => !k.startsWith(`${PLANTILLAS[0].name}:`));
  if (otras.length) console.log(`  otras plantillas del WABA: ${otras.map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

// 5. Prueba de envío: hello_world (en_US) viene aprobada con el número de test de Meta.
const probar = opt("--probar");
if (probar) {
  const cuenta = { ...fila, token, plantillas: {} };
  try { const r = await enviarPlantilla(cuenta, probar, "hello_world", "en_US", []); console.log(`✓ hello_world enviada a ${probar}: ${r.id}`); }
  catch (e) { console.error(`✗ Envío de prueba: ${e instanceof Error ? e.message : e} (¿el destinatario está en la lista de números de prueba de la app?)`); }
}

console.log(`
Siguiente:
  · Webhook en la app de Meta: https://aproba-software.com/api/whatsapp/webhook (verify token = META_WEBHOOK_VERIFY_TOKEN de Vercel),
    campos: messages, smb_message_echoes, history, smb_app_state_sync, message_template_status_update.
  · Desde el móvil (número de prueba autorizado), escribe al ${tel.display_phone_number} y manda una foto de un documento:
    debe aparecer en Ajustes › Integraciones › Bandeja (o directamente en el expediente si el teléfono es de un cliente).`);
