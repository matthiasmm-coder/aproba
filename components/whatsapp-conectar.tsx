"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// «CONECTAR MI WHATSAPP» (Ajustes › Integraciones, 12/09/2026) — Embedded Signup v4 de Meta
// con COEXISTENCIA: el gestor conecta el número que ya usa en su app WhatsApp Business
// (QR desde la app) y sigue usándola igual. A partir de ahí, cada foto/PDF que un cliente
// le mande entra solo en Aproba y los avisos salen desde su propio número.
// Necesita NEXT_PUBLIC_META_APP_ID + NEXT_PUBLIC_META_ES_CONFIG_ID; sin ellos, el bloque
// dice que está en preparación (nada que romper).
type Cuenta = { id: string; oficinaId: string | null; telefono: string | null; nombreVerificado: string | null; coexistencia: boolean; estado: string; error: string | null; plantillas: Record<string, string>; sincronizadoAt: string | null; createdAt: string };
declare global { interface Window { FB?: { init: (o: Record<string, unknown>) => void; login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void }; fbAsyncInit?: () => void } }

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID ?? "";

export function WhatsAppConectar({ oficinas = [] }: { oficinas?: { id: string; nombre: string }[] }) {
  const t = useT();
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [disponible, setDisponible] = useState<boolean>(false);
  const [sdk, setSdk] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oficinaId, setOficinaId] = useState<string>("");

  const cargar = async () => {
    try { const r = await fetch("/api/whatsapp/conectar"); const d = await r.json(); setCuentas(d.cuentas ?? []); setDisponible(Boolean(d.disponible)); } catch { setCuentas([]); }
  };
  useEffect(() => { void cargar(); }, []);

  // SDK de Facebook solo cuando hay app configurada (no se carga un script de Meta a nadie por defecto).
  useEffect(() => {
    if (!APP_ID || !CONFIG_ID || typeof window === "undefined" || window.FB) { if (window.FB) setSdk(true); return; }
    window.fbAsyncInit = () => { window.FB?.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: "v25.0" }); setSdk(true); };
    const s = document.createElement("script"); s.src = "https://connect.facebook.net/es_ES/sdk.js"; s.async = true; s.defer = true; s.crossOrigin = "anonymous"; document.body.appendChild(s);
  }, []);

  // Sesión del Embedded Signup: Meta manda por postMessage el waba_id / phone_number_id.
  useEffect(() => {
    const sesion: { wabaId?: string; phoneNumberId?: string; evento?: string } = {};
    const onMsg = (ev: MessageEvent) => {
      if (typeof ev.origin !== "string" || !ev.origin.endsWith("facebook.com")) return;
      try {
        const d = JSON.parse(ev.data);
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        sesion.evento = d.event;
        if (d.data?.waba_id) sesion.wabaId = String(d.data.waba_id);
        if (d.data?.phone_number_id) sesion.phoneNumberId = String(d.data.phone_number_id);
        (window as unknown as { __waSesion?: typeof sesion }).__waSesion = sesion;
      } catch { /* no es nuestro */ }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  function conectar() {
    if (!window.FB) return;
    setError(null); setOcupado(true);
    window.FB.login((r) => {
      const code = r?.authResponse?.code;
      const sesion = (window as unknown as { __waSesion?: { wabaId?: string; phoneNumberId?: string; evento?: string } }).__waSesion ?? {};
      if (!code || !sesion.wabaId) { setOcupado(false); setError(sesion.evento === "CANCEL" ? t("Conexión cancelada.") : t("Meta no ha devuelto los datos del alta. Vuelve a intentarlo.")); return; }
      void (async () => {
        try {
          const res = await fetch("/api/whatsapp/conectar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, wabaId: sesion.wabaId, phoneNumberId: sesion.phoneNumberId ?? null, oficinaId: oficinaId || null, coexistencia: sesion.evento === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" }) });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(d.error ?? t("No se pudo conectar."));
          await cargar();
        } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo conectar.")); }
        finally { setOcupado(false); }
      })();
    }, {
      config_id: CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      // v4 + coexistencia: el gestor conecta el número de su app WhatsApp Business (QR).
      extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
    });
  }

  async function desconectar(c: Cuenta) {
    if (!(await confirmar({ titulo: t("Desconectar WhatsApp"), mensaje: t("Aproba dejará de recibir los documentos y de enviar avisos por este número. Tu app de WhatsApp Business sigue funcionando igual."), confirmarLabel: t("Desconectar"), peligro: true }))) return;
    setOcupado(true);
    try { const r = await fetch("/api/whatsapp/conectar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? t("No se pudo desconectar.")); await cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : t("No se pudo desconectar.")); }
    finally { setOcupado(false); }
  }

  const activas = (cuentas ?? []).filter((c) => c.estado === "CONECTADA");
  const plantillaOk = (c: Cuenta) => Object.entries(c.plantillas ?? {}).some(([, v]) => v === "APPROVED");
  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#25D366]/15 text-[#128C7E]">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 12 12 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{t("Recibir documentos por WhatsApp")}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{t("Conecta el WhatsApp de tu despacho: las fotos y PDF que te manden tus clientes entran solos en Aproba, y los avisos salen desde tu propio número. Tú sigues usando tu app de WhatsApp Business como siempre.")}</p>
        </div>
      </div>

      {cuentas === null ? null : activas.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {activas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-aproba-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{c.telefono ? `+${c.telefono.replace(/^\+/, "")}` : t("Número conectado")}{c.nombreVerificado ? <span className="font-normal text-slate-500"> · {c.nombreVerificado}</span> : null}</p>
                <p className="text-xs text-slate-500">
                  {c.coexistencia ? t("Coexistencia con tu app de WhatsApp Business") : t("Número dedicado")}
                  {" · "}{plantillaOk(c) ? t("plantilla de avisos aprobada") : t("plantilla de avisos pendiente de aprobación por Meta")}
                  {oficinas.length > 1 && c.oficinaId ? ` · ${oficinas.find((o) => o.id === c.oficinaId)?.nombre ?? ""}` : ""}
                </p>
              </div>
              <button type="button" disabled={ocupado} onClick={() => desconectar(c)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-red-300 hover:text-red-700 disabled:opacity-50">{t("Desconectar")}</button>
            </li>
          ))}
        </ul>
      ) : !disponible || !APP_ID || !CONFIG_ID ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t("La conexión con WhatsApp está en preparación (pendiente de la verificación de Meta). Mientras tanto, reenvía los documentos a tu dirección de email de Aproba.")}</p>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-cream-50 p-4">
          <ol className="space-y-1.5 text-xs text-slate-600">
            <li><b className="text-slate-800">1.</b> {t("Ten a mano el móvil con tu app de WhatsApp Business: Meta te pedirá escanear un código QR desde ella.")}</li>
            <li><b className="text-slate-800">2.</b> {t("Pulsa «Conectar mi WhatsApp» y sigue los pasos de Meta (cuenta de Facebook del despacho).")}</li>
            <li><b className="text-slate-800">3.</b> {t("Listo: no cambias nada. Tus clientes escriben al número de siempre y Aproba archiva sus documentos.")}</li>
          </ol>
          {oficinas.length > 1 && (
            <label className="mt-3 block text-xs text-slate-500">{t("Oficina de este número")}
              <select value={oficinaId} onChange={(e) => setOficinaId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-aproba-600">
                <option value="">{t("Todo el despacho")}</option>
                {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={conectar} disabled={!sdk || ocupado} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#128C7E] px-4 text-sm font-semibold text-white transition hover:bg-[#0f7a6d] disabled:bg-slate-300">
            {ocupado ? t("Conectando…") : sdk ? t("Conectar mi WhatsApp") : t("Cargando Meta…")}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
