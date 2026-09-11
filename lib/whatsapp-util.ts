// WHATSAPP — parte PURA (sin server-only): normalización de teléfonos, lectura de los
// webhooks de Meta y la regla de la ventana de 24 h. Testeable con vitest; la compartimos
// entre el transporte (lib/whatsapp-meta), la recepción (lib/whatsapp-entrante) y el UI.

// Normaliza a E.164: quita separadores, convierte «00…» en «+…» y añade +34 a un móvil
// español de 9 cifras (empiezan por 6 o 7 — los fijos no tienen WhatsApp). Devuelve null
// si el número no parece utilizable.
export function telefonoE164(telefono: string | null | undefined): string | null {
  const limpio = (telefono ?? "").replace(/[\s\-().]/g, "");
  if (!limpio) return null;
  const conPrefijo = limpio.startsWith("00") ? `+${limpio.slice(2)}` : limpio;
  if (/^\+\d{8,15}$/.test(conPrefijo)) return conPrefijo;
  if (/^\d{10,15}$/.test(conPrefijo)) return `+${conPrefijo}`; // wa_id de Meta: sin «+»
  if (/^[67]\d{8}$/.test(conPrefijo)) return `+34${conPrefijo}`;
  return null;
}
// Mismo número escrito de dos formas (ficha del cliente vs wa_id de Meta) → misma clave.
export const claveTelefono = (t: string | null | undefined): string | null => telefonoE164(t)?.replace(/^\+/, "") ?? null;

// ── Ventana de atención de 24 h: dentro, texto libre; fuera, solo plantilla aprobada. ──
export const VENTANA_MS = 24 * 60 * 60 * 1000;
export const dentroDeVentana = (ultimoEntranteISO: string | null | undefined, ahora = Date.now()): boolean =>
  Boolean(ultimoEntranteISO) && ahora - Date.parse(ultimoEntranteISO as string) < VENTANA_MS;

// ── Lectura de un webhook de Meta (objeto whatsapp_business_account) ──────────
export type MensajeWA = {
  id: string; de: string; timestamp: string; tipo: string;
  texto: string | null; caption: string | null;
  media: { id: string; mime: string; nombre: string | null; sha256?: string } | null;
  contextoId: string | null; // respuesta a otro mensaje
  nombrePerfil: string | null;
};
export type EstadoWA = { id: string; estado: string; timestamp: string; destinatario: string; error: string | null };
export type EcoWA = { id: string; para: string; timestamp: string; tipo: string; texto: string | null; media: { id: string; mime: string; nombre: string | null } | null };
export type CambioWA =
  | { campo: "messages"; phoneNumberId: string; displayPhone: string | null; mensajes: MensajeWA[]; estados: EstadoWA[] }
  | { campo: "smb_message_echoes"; phoneNumberId: string; ecos: EcoWA[] }
  | { campo: "history"; phoneNumberId: string; fase: number | null; hilos: { telefono: string; mensajes: (EcoWA & { de: string })[] }[] }
  | { campo: "message_template_status_update"; wabaId: string; nombre: string; idioma: string; estado: string; motivo: string | null }
  | { campo: "otro"; nombre: string };

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const mediaDe = (m: Raw): MensajeWA["media"] => {
  const tipo = str(m.type);
  const obj = tipo ? (m[tipo] as Raw | undefined) : undefined;
  if (!obj || !str(obj.id)) return null;
  if (!["image", "document", "audio", "video", "sticker"].includes(tipo ?? "")) return null;
  return { id: str(obj.id)!, mime: str(obj.mime_type) ?? "application/octet-stream", nombre: str(obj.filename), ...(str(obj.sha256) ? { sha256: str(obj.sha256)! } : {}) };
};
const textoDe = (m: Raw): { texto: string | null; caption: string | null } => {
  const tipo = str(m.type);
  if (tipo === "text") return { texto: str((m.text as Raw | undefined)?.body), caption: null };
  if (tipo === "button") return { texto: str((m.button as Raw | undefined)?.text), caption: null };
  if (tipo === "interactive") { const i = m.interactive as Raw | undefined; const br = (i?.button_reply ?? i?.list_reply) as Raw | undefined; return { texto: str(br?.title), caption: null }; }
  const obj = tipo ? (m[tipo] as Raw | undefined) : undefined;
  return { texto: null, caption: str(obj?.caption) };
};

export function leerWebhook(payload: unknown): CambioWA[] {
  const out: CambioWA[] = [];
  const p = payload as Raw;
  if (!p || p.object !== "whatsapp_business_account" || !Array.isArray(p.entry)) return out;
  for (const entry of p.entry as Raw[]) {
    const wabaId = str(entry.id) ?? "";
    for (const ch of (Array.isArray(entry.changes) ? entry.changes : []) as Raw[]) {
      const campo = str(ch.field) ?? "";
      const v = (ch.value ?? {}) as Raw;
      const meta = (v.metadata ?? {}) as Raw;
      const phoneNumberId = str(meta.phone_number_id) ?? "";
      if (campo === "messages") {
        const perfiles = new Map<string, string>();
        for (const c of (Array.isArray(v.contacts) ? v.contacts : []) as Raw[]) { const wa = str(c.wa_id); const n = str((c.profile as Raw | undefined)?.name); if (wa && n) perfiles.set(wa, n); }
        const mensajes: MensajeWA[] = [];
        for (const m of (Array.isArray(v.messages) ? v.messages : []) as Raw[]) {
          const id = str(m.id), de = str(m.from); if (!id || !de) continue;
          const { texto, caption } = textoDe(m);
          mensajes.push({ id, de, timestamp: str(m.timestamp) ?? "", tipo: str(m.type) ?? "otro", texto, caption, media: mediaDe(m), contextoId: str((m.context as Raw | undefined)?.id), nombrePerfil: perfiles.get(de) ?? null });
        }
        const estados: EstadoWA[] = [];
        for (const s of (Array.isArray(v.statuses) ? v.statuses : []) as Raw[]) {
          const id = str(s.id); if (!id) continue;
          const errs = Array.isArray(s.errors) ? (s.errors as Raw[]) : [];
          estados.push({ id, estado: str(s.status) ?? "", timestamp: str(s.timestamp) ?? "", destinatario: str(s.recipient_id) ?? "", error: errs.length ? `${str(errs[0].code) ?? ""} ${str(errs[0].title) ?? str(errs[0].message) ?? ""}`.trim() || null : null });
        }
        out.push({ campo, phoneNumberId, displayPhone: str(meta.display_phone_number), mensajes, estados });
      } else if (campo === "smb_message_echoes") {
        const ecos: EcoWA[] = [];
        for (const m of (Array.isArray(v.message_echoes) ? v.message_echoes : []) as Raw[]) {
          const id = str(m.id), para = str(m.to); if (!id || !para) continue;
          const { texto, caption } = textoDe(m);
          ecos.push({ id, para, timestamp: str(m.timestamp) ?? "", tipo: str(m.type) ?? "otro", texto: texto ?? caption, media: mediaDe(m) });
        }
        out.push({ campo, phoneNumberId, ecos });
      } else if (campo === "history") {
        const hilos: { telefono: string; mensajes: (EcoWA & { de: string })[] }[] = [];
        let fase: number | null = null;
        for (const h of (Array.isArray(v.history) ? v.history : []) as Raw[]) {
          const hm = (h.metadata ?? {}) as Raw; if (typeof hm.phase === "number") fase = hm.phase;
          for (const th of (Array.isArray(h.threads) ? h.threads : []) as Raw[]) {
            const telefono = str(th.id) ?? ""; const mensajes: (EcoWA & { de: string })[] = [];
            for (const m of (Array.isArray(th.messages) ? th.messages : []) as Raw[]) {
              const id = str(m.id); if (!id) continue;
              const { texto, caption } = textoDe(m);
              mensajes.push({ id, de: str(m.from) ?? "", para: str(m.to) ?? "", timestamp: str(m.timestamp) ?? "", tipo: str(m.type) ?? "otro", texto: texto ?? caption, media: mediaDe(m) });
            }
            if (telefono) hilos.push({ telefono, mensajes });
          }
        }
        out.push({ campo, phoneNumberId, fase, hilos });
      } else if (campo === "message_template_status_update") {
        out.push({ campo, wabaId, nombre: str(v.message_template_name) ?? "", idioma: str(v.message_template_language) ?? "", estado: str(v.event) ?? "", motivo: str(v.reason) });
      } else {
        out.push({ campo: "otro", nombre: campo });
      }
    }
  }
  return out;
}

// Texto de la respuesta automática al cliente cuando sus documentos se han guardado.
// Sobrio y en su idioma: Aproba es un asistente silencioso del despacho, no un bot.
export const ADMITIDOS_WA = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
