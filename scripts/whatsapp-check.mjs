// Comprobación de la configuración de Meta (WhatsApp del despacho) — solo lectura.
//
//   node --env-file=.env.local scripts/whatsapp-check.mjs [--waba <id>] [--phone <id>]
//
// Con META_APP_ID + META_APP_SECRET comprueba, contra Graph: que la app existe y el
// secreto es correcto (token de app), qué webhooks tiene suscritos la app para
// «whatsapp_business_account» y con qué URL, y —si se dan— el estado del WABA y del
// número. Con WA_TOKEN comprueba también a quién pertenece ese token y sus permisos.
// No imprime ningún secreto; nada se escribe.
const v = (k) => (process.env[k] ?? "").trim();
const GRAPH = `https://graph.facebook.com/${v("META_GRAPH_VERSION") || "v25.0"}`;
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const ok = (s) => console.log("✓", s), ko = (s) => console.log("✗", s), info = (s) => console.log("·", s);

async function graph(path, token) {
  const r = await fetch(`${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${r.status} ${j.error?.message ?? "error"}${j.error?.code ? ` (code ${j.error.code})` : ""}`);
  return j;
}

const appId = v("META_APP_ID"), secret = v("META_APP_SECRET");
console.log(`Entorno: META_APP_ID ${appId ? "presente" : "FALTA"} · META_APP_SECRET ${secret ? "presente" : "FALTA"} · META_WEBHOOK_VERIFY_TOKEN ${v("META_WEBHOOK_VERIFY_TOKEN") ? "presente" : "FALTA"} · NEXT_PUBLIC_META_APP_ID ${v("NEXT_PUBLIC_META_APP_ID") ? "presente" : "FALTA"} · NEXT_PUBLIC_META_ES_CONFIG_ID ${v("NEXT_PUBLIC_META_ES_CONFIG_ID") ? "presente" : "FALTA"}`);
if (appId && v("NEXT_PUBLIC_META_APP_ID") && appId !== v("NEXT_PUBLIC_META_APP_ID")) ko("META_APP_ID y NEXT_PUBLIC_META_APP_ID no coinciden");

if (appId && secret) {
  const appToken = `${appId}|${secret}`;
  try {
    const app = await graph(`/${appId}?fields=name,link,category`, appToken);
    ok(`App «${app.name}» (${app.category ?? "sin categoría"}) — el secreto es válido`);
  } catch (e) { ko(`App/secreto: ${e.message}`); }
  try {
    const subs = await graph(`/${appId}/subscriptions`, appToken);
    const wa = (subs.data ?? []).find((s) => s.object === "whatsapp_business_account");
    if (!wa) ko("La app NO tiene webhook configurado para «whatsapp_business_account» (Panel de la app › WhatsApp › Configuración › Webhooks)");
    else {
      ok(`Webhook whatsapp_business_account → ${wa.callback_url} (${wa.active ? "activo" : "INACTIVO"})`);
      const campos = new Set((wa.fields ?? []).map((f) => f.name));
      for (const c of ["messages", "smb_message_echoes", "history", "smb_app_state_sync", "message_template_status_update"]) (campos.has(c) ? ok : ko)(`campo «${c}»${campos.has(c) ? "" : " — falta suscribirlo"}`);
      if (!/aproba-software\.com\/api\/whatsapp\/webhook$/.test(wa.callback_url ?? "")) ko("La URL del webhook no es https://aproba-software.com/api/whatsapp/webhook");
    }
  } catch (e) { ko(`Suscripciones: ${e.message}`); }
} else info("Sin META_APP_ID/META_APP_SECRET no se puede comprobar la app.");

const token = v("WA_TOKEN");
if (token) {
  try {
    const d = await graph(`/debug_token?input_token=${encodeURIComponent(token)}`, appId && secret ? `${appId}|${secret}` : token);
    const t = d.data ?? {};
    ok(`WA_TOKEN válido · tipo ${t.type ?? "?"} · app ${t.app_id ?? "?"} · caduca ${t.expires_at ? new Date(t.expires_at * 1000).toISOString() : "nunca"}`);
    const faltan = ["whatsapp_business_management", "whatsapp_business_messaging"].filter((p) => !(t.scopes ?? []).includes(p));
    (faltan.length ? ko : ok)(faltan.length ? `permisos que faltan en el token: ${faltan.join(", ")}` : "permisos whatsapp_business_management + whatsapp_business_messaging");
  } catch (e) { ko(`WA_TOKEN: ${e.message}`); }
  const waba = arg("--waba") ?? v("WA_WABA_ID"), phone = arg("--phone") ?? v("WA_PHONE_NUMBER_ID");
  if (waba) {
    try {
      const w = await graph(`/${waba}?fields=name,account_review_status,message_template_namespace`, token);
      ok(`WABA «${w.name}» · revisión ${w.account_review_status ?? "?"}`);
      const nums = await graph(`/${waba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type,is_on_biz_app`, token);
      for (const n of nums.data ?? []) info(`número ${n.display_phone_number} (${n.id}) · ${n.verified_name ?? "sin nombre"} · calidad ${n.quality_rating ?? "?"} · ${n.platform_type ?? "?"}${n.is_on_biz_app ? " · coexistencia" : ""}`);
      const apps = await graph(`/${waba}/subscribed_apps`, token);
      ((apps.data ?? []).some((a) => String(a.whatsapp_business_api_data?.id ?? a.id) === appId) ? ok : ko)(`app suscrita al WABA${(apps.data ?? []).length ? "" : " — ninguna (scripts/whatsapp-cuenta-prueba.mjs la suscribe)"}`);
    } catch (e) { ko(`WABA: ${e.message}`); }
  }
  if (phone) {
    try { const p = await graph(`/${phone}?fields=display_phone_number,verified_name,code_verification_status,quality_rating`, token); ok(`número ${p.display_phone_number} · verificación ${p.code_verification_status ?? "?"}`); }
    catch (e) { ko(`número: ${e.message}`); }
  }
} else info("Sin WA_TOKEN no se comprueban WABA ni número (opcional).");
