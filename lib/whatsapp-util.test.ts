import { describe, it, expect } from "vitest";
import { leerWebhook, telefonoE164, claveTelefono, dentroDeVentana } from "./whatsapp-util";

// Forma real de los webhooks de la WhatsApp Business Platform (Meta Cloud API).
const webhook = (changes: unknown[]) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA1", changes }] });
const meta = { display_phone_number: "34612345678", phone_number_id: "PNID1" };

describe("leerWebhook · messages", () => {
  it("texto + foto + PDF con nombre de perfil, caption y contexto de respuesta", () => {
    const [c] = leerWebhook(webhook([{ field: "messages", value: { messaging_product: "whatsapp", metadata: meta,
      contacts: [{ wa_id: "34600111222", profile: { name: "Carlos R." } }],
      messages: [
        { from: "34600111222", id: "wamid.T1", timestamp: "1757600000", type: "text", text: { body: "Hola, te mando el pasaporte" } },
        { from: "34600111222", id: "wamid.I1", timestamp: "1757600010", type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", sha256: "abc", caption: "pasaporte" } },
        { from: "34600111222", id: "wamid.D1", timestamp: "1757600020", type: "document", document: { id: "MEDIA2", mime_type: "application/pdf", filename: "empadronamiento.pdf" }, context: { from: "34612345678", id: "wamid.PREV" } },
      ] } }]));
    if (c.campo !== "messages") throw new Error("campo");
    expect(c.phoneNumberId).toBe("PNID1");
    expect(c.mensajes).toHaveLength(3);
    expect(c.mensajes[0]).toMatchObject({ id: "wamid.T1", de: "34600111222", tipo: "text", texto: "Hola, te mando el pasaporte", media: null, nombrePerfil: "Carlos R." });
    expect(c.mensajes[1]).toMatchObject({ tipo: "image", caption: "pasaporte", media: { id: "MEDIA1", mime: "image/jpeg", nombre: null } });
    expect(c.mensajes[2]).toMatchObject({ tipo: "document", media: { id: "MEDIA2", mime: "application/pdf", nombre: "empadronamiento.pdf" }, contextoId: "wamid.PREV" });
  });
  it("estados de entrega de nuestros envíos (sent/delivered/read/failed con error)", () => {
    const [c] = leerWebhook(webhook([{ field: "messages", value: { messaging_product: "whatsapp", metadata: meta,
      statuses: [{ id: "wamid.OUT1", status: "delivered", timestamp: "1757600100", recipient_id: "34600111222" }, { id: "wamid.OUT2", status: "failed", timestamp: "1757600100", recipient_id: "34600111222", errors: [{ code: 131047, title: "Re-engagement message" }] }] } }]));
    if (c.campo !== "messages") throw new Error("campo");
    expect(c.mensajes).toHaveLength(0);
    expect(c.estados).toEqual([
      { id: "wamid.OUT1", estado: "delivered", timestamp: "1757600100", destinatario: "34600111222", error: null },
      { id: "wamid.OUT2", estado: "failed", timestamp: "1757600100", destinatario: "34600111222", error: "131047 Re-engagement message" },
    ]);
  });
  it("audio/vídeo llevan media pero NO son documentos admitidos (se decide después)", () => {
    const [c] = leerWebhook(webhook([{ field: "messages", value: { metadata: meta, messages: [{ from: "34600111222", id: "wamid.A1", timestamp: "1", type: "audio", audio: { id: "M3", mime_type: "audio/ogg" } }] } }]));
    if (c.campo !== "messages") throw new Error("campo");
    expect(c.mensajes[0].media).toEqual({ id: "M3", mime: "audio/ogg", nombre: null });
  });
});

describe("leerWebhook · coexistencia", () => {
  it("ecos de lo que el gestor escribe desde su app", () => {
    const [c] = leerWebhook(webhook([{ field: "smb_message_echoes", value: { messaging_product: "whatsapp", metadata: meta, message_echoes: [{ from: "34612345678", to: "34600111222", id: "wamid.E1", timestamp: "1757600200", type: "text", text: { body: "Perfecto, lo miro" } }] } }]));
    expect(c).toMatchObject({ campo: "smb_message_echoes", phoneNumberId: "PNID1", ecos: [{ id: "wamid.E1", para: "34600111222", tipo: "text", texto: "Perfecto, lo miro" }] });
  });
  it("historial sincronizado: hilos por teléfono con fase", () => {
    const [c] = leerWebhook(webhook([{ field: "history", value: { messaging_product: "whatsapp", metadata: meta, history: [{ metadata: { phase: 1, chunk_order: 1, progress: 100 }, threads: [{ id: "34600111222", messages: [{ from: "34600111222", to: "34612345678", id: "wamid.H1", timestamp: "1750000000", type: "text", text: { body: "Buenos días" } }] }] }] } }]));
    if (c.campo !== "history") throw new Error("campo");
    expect(c.fase).toBe(1);
    expect(c.hilos[0]).toMatchObject({ telefono: "34600111222", mensajes: [{ id: "wamid.H1", de: "34600111222", texto: "Buenos días" }] });
  });
  it("estado de una plantilla", () => {
    const [c] = leerWebhook(webhook([{ field: "message_template_status_update", value: { event: "APPROVED", message_template_id: 1, message_template_name: "aproba_aviso", message_template_language: "es" } }]));
    expect(c).toEqual({ campo: "message_template_status_update", wabaId: "WABA1", nombre: "aproba_aviso", idioma: "es", estado: "APPROVED", motivo: null });
  });
  it("otros objetos o campos → nada / «otro», nunca una excepción", () => {
    expect(leerWebhook({ object: "page", entry: [] })).toEqual([]);
    expect(leerWebhook(null)).toEqual([]);
    expect(leerWebhook(webhook([{ field: "account_update", value: {} }]))).toEqual([{ campo: "otro", nombre: "account_update" }]);
  });
});

describe("teléfonos: la ficha y el wa_id de Meta hablan de la misma persona", () => {
  it("wa_id sin «+», ficha con espacios, móvil español a secas → misma clave", () => {
    expect(telefonoE164("34600111222")).toBe("+34600111222");
    expect(telefonoE164("+34 600 111 222")).toBe("+34600111222");
    expect(telefonoE164("600111222")).toBe("+34600111222");
    expect(new Set([claveTelefono("34600111222"), claveTelefono("+34 600-111-222"), claveTelefono("600 111 222")]).size).toBe(1);
  });
  it("fijos y basura → null", () => {
    expect(telefonoE164("934123456")).toBeNull();
    expect(telefonoE164("abc")).toBeNull();
    expect(claveTelefono(null)).toBeNull();
  });
});

describe("ventana de 24 h", () => {
  const ahora = Date.parse("2026-09-12T12:00:00Z");
  it("dentro: último entrante hace 23 h → texto libre", () => { expect(dentroDeVentana("2026-09-11T13:00:00Z", ahora)).toBe(true); });
  it("fuera: hace 25 h, o nunca → plantilla", () => { expect(dentroDeVentana("2026-09-11T11:00:00Z", ahora)).toBe(false); expect(dentroDeVentana(null, ahora)).toBe(false); });
});
