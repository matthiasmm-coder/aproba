// Socle commun de la suite e2e — session, fixtures RÉVERSIBLES, helpers.
//
// ⚠️ La suite tourne contre la PROD (E2E_BASE_URL, défaut aproba-software.com)
// mais n'écrit QUE dans le workspace de test (celui de demo@aproba-software.com,
// « Gestoría Vallès »). Toute fixture porte le préfixe ZZE2E et est nettoyée en
// finally — même quand un check échoue. Le compteur UsoMensual est MONOTONE :
// on le redescend d'autant d'expedientes créés.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// En local, .env.local ; en CI, les variables d'environnement (secrets GitHub).
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(join(raiz, ".env.local"), "utf8")
      .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
  );
} catch { env = {}; }
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (process.env[k]) env[k] = process.env[k];
}

export const BASE = process.env.E2E_BASE_URL ?? "https://aproba-software.com";
export const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
export const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const admin = createClient(URL_SB, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ctxCache = null;
// Contexte de test : user demo, son workspace, ses oficinas, cookie de session.
export async function contexto() {
  if (ctxCache) return ctxCache;
  const { data: au } = await admin.auth.admin.listUsers();
  const user = au.users.find((u) => u.email === "demo@aproba-software.com");
  if (!user) throw new Error("cuenta demo introuvable");
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  const ws = mem.workspaceId;
  const { data: ofis } = await admin.from("Oficina").select("id, nombre, orden").eq("workspaceId", ws).order("orden");
  if ((ofis ?? []).length < 2) throw new Error("le ws de test doit avoir ≥2 oficinas");

  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  const vr = await fetch(`${URL_SB}/auth/v1/verify?token=${link.properties.hashed_token}&type=magiclink&redirect_to=${BASE}`, { redirect: "manual" });
  const loc = vr.headers.get("location");
  const at = new URL(loc.replace("#", "?")).searchParams.get("access_token");
  const rt = new URL(loc.replace("#", "?")).searchParams.get("refresh_token");
  if (!at) throw new Error("magic link sans access_token (compte demo ?)");
  const ref = new URL(URL_SB).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify({
    access_token: at, refresh_token: rt, token_type: "bearer",
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: user.id, email: user.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} },
  })).toString("base64url")}`;

  ctxCache = {
    user, ws, oficinas: ofis, cookie, accessToken: at,
    madrid: ofis.find((o) => /Madrid/i.test(o.nombre)) ?? ofis[1],
    zaragoza: ofis.find((o) => /Zaragoza/i.test(o.nombre)) ?? ofis[ofis.length - 1],
  };
  return ctxCache;
}

// Appel API sous la session demo, avec la pastille (cookie aproba_oficina) choisie.
export async function api(path, { sede = "todas", method = "POST", body = null } = {}) {
  const { cookie } = await contexto();
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: `${cookie}; aproba_oficina=${sede}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, d: await r.json().catch(() => ({})) };
}

// ── Fixtures réversibles ─────────────────────────────────────────────────────
export function colector() {
  const c = { clientes: [], expedientes: [], familias: [], vencimientos: [], facturas: [] };
  return {
    c,
    cliente: async (props = {}) => {
      const { ws } = await contexto();
      const id = crypto.randomUUID();
      const { error } = await admin.from("Cliente").insert({ id, workspaceId: ws, nombre: "ZZE2E", apellidos: Math.random().toString(36).slice(2, 8), updatedAt: new Date().toISOString(), ...props });
      if (error) throw new Error(`fixture cliente: ${error.message}`);
      c.clientes.push(id);
      return id;
    },
    familia: async (nombre = "ZZE2E Familia") => {
      const { ws } = await contexto();
      const id = crypto.randomUUID();
      const { error } = await admin.from("Familia").insert({ id, workspaceId: ws, nombre, updatedAt: new Date().toISOString() });
      if (error) throw new Error(`fixture familia: ${error.message}`);
      c.familias.push(id);
      return id;
    },
    vencimiento: async (clienteId, dias = 30) => {
      const { ws } = await contexto();
      const id = crypto.randomUUID();
      // ⚠️ pas de colonne `origen` sur Vencimiento — un insert avec échoue en silence
      const { error } = await admin.from("Vencimiento").insert({ id, workspaceId: ws, clienteId, tipo: "TIE", fecha: new Date(Date.now() + dias * 864e5).toISOString(), estado: "PENDIENTE", updatedAt: new Date().toISOString() });
      if (error) throw new Error(`fixture vencimiento: ${error.message}`);
      c.vencimientos.push(id);
      return id;
    },
    expediente: (id) => { if (id) c.expedientes.push(id); },
    factura: (id) => { if (id) c.facturas.push(id); },
    limpiar: async () => {
      const { ws } = await contexto();
      for (const f of c.facturas) await admin.from("Factura").delete().eq("id", f);
      for (const e of c.expedientes) await admin.from("Expediente").delete().eq("id", e);
      for (const v of c.vencimientos) await admin.from("Vencimiento").delete().eq("id", v);
      for (const cl of c.clientes) await admin.from("Cliente").delete().eq("id", cl);
      for (const fa of c.familias) await admin.from("Familia").delete().eq("id", fa);
      if (c.expedientes.length) {
        const mes = new Date().toISOString().slice(0, 7);
        const { data: uso } = await admin.from("UsoMensual").select("expedientes").eq("workspaceId", ws).eq("mes", mes).maybeSingle();
        if (uso) await admin.from("UsoMensual").update({ expedientes: Math.max(0, uso.expedientes - c.expedientes.length) }).eq("workspaceId", ws).eq("mes", mes);
      }
    },
  };
}

// Mini-assert : accumule, n'interrompt pas le scénario.
export function verificador(nombre) {
  const checks = [];
  return {
    ok: (cond, label) => checks.push([Boolean(cond), label]),
    resumen: () => {
      let ok = 0;
      for (const [pass, label] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${label}`); if (pass) ok++; }
      const total = checks.length;
      console.log(`  → ${nombre}: ${ok}/${total}`);
      return { ok, total };
    },
  };
}
