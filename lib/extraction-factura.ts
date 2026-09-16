import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODELO_EXTRACTION, MEDIA_IMAGEN, prepararImagen } from "@/lib/extraction";
import { normalizarFacturaLeida, type ExtraccionFacturaCruda, type FacturaLeida } from "@/lib/facturas-recibidas";

// LECTURA DE UNA FACTURA RECIBIDA (proveedor) con Claude Vision — 16/09/2026.
// Mismo patrón que lib/extraction.ts (documentos de extranjería): prompt fijo cacheado,
// el archivo al final, JSON de vuelta parseado a la defensiva. Devuelve SIEMPRE un
// resultado: un archivo ilegible se archiva marcado «revisar», nunca rompe la subida.

const SYSTEM_FACTURA = `Eres un asistente experto en leer facturas y recibos que recibe un despacho profesional en España (facturas de proveedores: alquiler, software, telefonía, colegios profesionales, seguros, tasas, suministros, servicios). Lees el documento y devuelves SOLO un JSON con la estructura pedida, sin markdown ni explicaciones.

REGLAS:
1. Extrae SOLO lo visible. NUNCA inventes ni deduzcas datos que no aparecen; usa null.
2. es_factura = true si el documento es una factura, factura simplificada, recibo o ticket con importe. Si es otra cosa (pasaporte, contrato, carta, formulario, foto sin importes), es_factura = false y el resto null.
3. proveedor_nombre y proveedor_nif son los de quien EMITE la factura (no del destinatario). Nombre tal cual figura.
4. numero = número de factura tal cual figura. fecha = fecha de EMISIÓN, en AAAA-MM-DD.
5. Importes en número con punto decimal y sin símbolo: base_imponible (suma de bases), tipo_iva (porcentaje principal: 21, 10, 4 o 0; si hay varios, el de mayor base), cuota_iva (suma de todas las cuotas de IVA), total (importe total a pagar). Si figura retención de IRPF, el total es el importe final a pagar tras la retención.
6. concepto = descripción breve (máx. 120 caracteres) de lo facturado.
7. moneda = código ISO (EUR, USD…) si se distingue; null si no.
8. confianza = número 0-1 sobre la fiabilidad global de la lectura. legible = false si el documento está borroso, cortado o vacío.
REGLA ABSOLUTA: devuelve el JSON SIEMPRE, también con el documento en blanco o ilegible (es_factura false, legible false, confianza 0).`;

const PLANTILLA = `{
  "es_factura": true,
  "proveedor_nombre": null, "proveedor_nif": null,
  "numero": null, "fecha": null,
  "base_imponible": null, "tipo_iva": null, "cuota_iva": null, "total": null,
  "concepto": null, "moneda": null,
  "confianza": 0.0, "legible": true
}`;

const ILEGIBLE: FacturaLeida = normalizarFacturaLeida({ es_factura: false, confianza: 0, legible: false });

export async function extraerFacturaRecibida(buffer: Buffer, mimeType: string): Promise<FacturaLeida & { inputTokens: number; outputTokens: number }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY — la lectura de facturas no está configurada.");
  if (mimeType !== "application/pdf" && !MEDIA_IMAGEN.has(mimeType)) throw new Error(`Formato no soportado: ${mimeType}`);
  const client = new Anthropic();
  const esPdf = mimeType === "application/pdf";
  const img = esPdf ? { buffer, mimeType } : await prepararImagen(buffer, mimeType);
  const b64 = img.buffer.toString("base64");
  const docBlock = esPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: b64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: img.mimeType as "image/jpeg" | "image/png" | "image/webp", data: b64 } };

  const res = await client.messages.create({
    model: MODELO_EXTRACTION,
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM_FACTURA, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `Lee la factura adjunta a continuación y rellena EXACTAMENTE esta estructura JSON. Devuelve SOLO el JSON:\n\n${PLANTILLA}`, cache_control: { type: "ephemeral" } },
        docBlock,
      ],
    }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  const texto = res.content.find((b) => b.type === "text");
  let raw = (texto && "text" in texto ? texto.text : "{}").trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let cruda: ExtraccionFacturaCruda | null = null;
  try { cruda = JSON.parse(raw) as ExtraccionFacturaCruda; }
  catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { cruda = JSON.parse(m[0]) as ExtraccionFacturaCruda; } catch { cruda = null; } }
  }
  if (!cruda) { console.error("[extraction factura] respuesta no-JSON:", raw.slice(0, 200)); return { ...ILEGIBLE, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }; }
  return { ...normalizarFacturaLeida(cruda), inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}
