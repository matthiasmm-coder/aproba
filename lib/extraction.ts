import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Validation IA des documents d'extranjería — porté du POC (aproba/poc-vision).
// Claude Vision lit le document (image ou PDF), le classifie, extrait les champs
// et évalue la qualité. Sortie structurée stricte via output_config.format :
// l'API garantit un JSON conforme au schéma.

export const MODELO_EXTRACTION = "claude-opus-4-8";

const SYSTEM_PROMPT = `Eres un asistente experto en la lectura de documentos de extranjería en España (gestorías y abogados). Tu tarea es extraer datos estructurados de un documento escaneado o fotografiado, con la máxima precisión.

TIPOS DE DOCUMENTO QUE PUEDES RECIBIR:
- pasaporte (de cualquier país)
- tarjeta_residencia_tie (Tarjeta de Identidad de Extranjero)
- certificado_nie (asignación de NIE)
- empadronamiento (certificado o volante de empadronamiento)
- contrato_trabajo
- nomina
- antecedentes_penales (certificado de antecedentes penales, español o extranjero)
- certificado_bancario (saldo, extracto, certificado de cuenta)
- libro_familia
- titulo_estudios
- otro / desconocido (si no encaja o no se distingue)

REGLAS DE EXTRACCIÓN (estrictas):
1. Extrae SOLO lo que está visible en el documento. NUNCA inventes ni deduzcas datos que no aparecen.
2. Si un campo no existe en este tipo de documento, o no es legible, ponlo a null. No lo rellenes "por si acaso".
3. Fechas SIEMPRE en formato ISO 8601 (AAAA-MM-DD). Convierte desde dd/mm/aaaa u otros formatos. Si solo hay mes/año, usa el día 01.
4. NIE: formato letra inicial (X, Y o Z) + 7 dígitos + letra final (ej. Y1234567X). NIF/DNI español: 8 dígitos + letra. Respeta mayúsculas.
5. Nombres: separa "nombre" (de pila) y "apellidos" cuando el documento los distingue claramente; rellena además "nombre_completo" con el nombre tal cual aparece. Si solo hay un bloque de nombre, deja nombre/apellidos a null y usa nombre_completo.
6. Importes (salario, saldo): número sin símbolo de moneda ni separador de miles (ej. 18000.50). La moneda va aparte en "moneda" (EUR, USD…).
7. IBAN: cópialo tal cual; si solo se ve parcialmente, copia la parte visible.

EVALUACIÓN DE CALIDAD (muy importante para el gestor):
- legibilidad: "legible" (todo claro), "parcial" (parte borrosa/cortada), "ilegible" (no se puede trabajar con esto).
- campos_ilegibles: lista de los campos que deberían estar pero no se leen bien.
- alertas: avisos accionables para el gestor. Ejemplos: "documento caducado" (si fecha_caducidad < hoy), "foto recortada, falta un borde", "calidad muy baja, pedir reenvío". Sé concreto.
- confianza_clasificacion y confianza_global: número entre 0 y 1. Sé honesto: si dudas, baja la confianza.
- notas: observación libre breve si hace falta (o null).

SALIDA:
Devuelve únicamente el objeto JSON que cumple el esquema proporcionado. Nada de texto adicional, ni explicaciones, ni markdown.`;

// Squelette JSON attendu — on guide le modèle par l'exemple plutôt que par
// output_config.format : le schéma strict dépasse la limite de 16 champs à type
// union (nullable) imposée par l'API de sortie structurée. Opus respecte ce
// gabarit très fidèlement, et on valide/parse le résultat côté serveur.
const PLANTILLA_JSON = `{
  "tipo_documento": "uno de: pasaporte | tarjeta_residencia_tie | certificado_nie | empadronamiento | contrato_trabajo | nomina | antecedentes_penales | certificado_bancario | libro_familia | titulo_estudios | otro | desconocido",
  "confianza_clasificacion": 0.0,
  "nombre": null, "apellidos": null, "nombre_completo": null,
  "sexo": null, "nacionalidad": null, "fecha_nacimiento": null, "lugar_nacimiento": null,
  "numero_nie": null, "numero_pasaporte": null, "numero_documento": null, "numero_soporte": null,
  "fecha_expedicion": null, "fecha_caducidad": null, "fecha_emision": null,
  "direccion": null, "municipio": null, "provincia": null, "codigo_postal": null, "pais": null,
  "empleador": null, "cif_empleador": null, "puesto": null, "tipo_contrato": null,
  "salario_bruto_anual": null, "fecha_inicio_contrato": null,
  "titular_cuenta": null, "entidad_bancaria": null, "iban": null, "saldo_importe": null, "moneda": null,
  "legibilidad": "uno de: legible | parcial | ilegible",
  "campos_ilegibles": [], "alertas": [],
  "confianza_global": 0.0, "notas": null
}`;

type ExtraccionCruda = {
  tipo_documento: string;
  confianza_clasificacion: number;
  legibilidad: "legible" | "parcial" | "ilegible";
  campos_ilegibles: string[];
  alertas: string[];
  confianza_global: number;
  notas: string | null;
  [campo: string]: unknown;
};

// Champs → libellés UI (seuls les non-null sont affichés).
const LABELS: [string, string][] = [
  ["nombre_completo", "Nombre completo"],
  ["nombre", "Nombre"],
  ["apellidos", "Apellidos"],
  ["sexo", "Sexo"],
  ["nacionalidad", "Nacionalidad"],
  ["fecha_nacimiento", "Fecha de nacimiento"],
  ["lugar_nacimiento", "Lugar de nacimiento"],
  ["numero_nie", "NIE"],
  ["numero_pasaporte", "Nº pasaporte"],
  ["numero_documento", "Nº documento"],
  ["numero_soporte", "Nº soporte"],
  ["fecha_expedicion", "Expedición"],
  ["fecha_caducidad", "Caducidad"],
  ["fecha_emision", "Emisión"],
  ["direccion", "Dirección"],
  ["municipio", "Municipio"],
  ["provincia", "Provincia"],
  ["codigo_postal", "Código postal"],
  ["pais", "País"],
  ["empleador", "Empleador"],
  ["puesto", "Puesto"],
  ["tipo_contrato", "Tipo de contrato"],
  ["salario_bruto_anual", "Salario bruto anual"],
  ["fecha_inicio_contrato", "Inicio del contrato"],
  ["titular_cuenta", "Titular de la cuenta"],
  ["entidad_bancaria", "Entidad"],
  ["iban", "IBAN"],
  ["saldo_importe", "Saldo"],
  ["moneda", "Moneda"],
];

export type ResultadoExtraccion = {
  estado: "VALIDADO" | "RECHAZADO";
  tipoDetectado: string;
  confianzaGlobal: number;
  legibilidad: "legible" | "parcial" | "ilegible";
  campos: { label: string; value: string }[];
  // Vigía: caducidad del documento (AAAA-MM-DD) expuesta directamente — antes solo
  // vivía dentro de `campos` (label "Caducidad") y se tiraba tras mostrarla.
  fechaCaducidad: string | null;
  alertas: string[];
  modelo: string;
  inputTokens: number;
  outputTokens: number;
};

const MEDIA_IMAGEN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function extraerDocumento(buffer: Buffer, mimeType: string): Promise<ResultadoExtraccion> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY en .env.local — la validación IA no está configurada.");
  }
  const client = new Anthropic();
  const b64 = buffer.toString("base64");

  const docBlock =
    mimeType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: b64 } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: b64 } };

  if (mimeType !== "application/pdf" && !MEDIA_IMAGEN.has(mimeType)) {
    throw new Error(`Formato no soportado: ${mimeType}`);
  }

  const res = await client.messages.create({
    model: MODELO_EXTRACTION,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          docBlock,
          { type: "text", text: `Extrae los datos de este documento y rellena EXACTAMENTE esta estructura JSON (usa null donde no aplique o no se lea, fechas en AAAA-MM-DD). Devuelve SOLO el JSON, sin markdown ni explicaciones:\n\n${PLANTILLA_JSON}` },
        ],
      },
    ],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  const texto = res.content.find((b) => b.type === "text");
  let raw = (texto && "text" in texto ? texto.text : "{}").trim();
  // défense : retirer d'éventuelles clôtures markdown ```json … ```
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const cruda = JSON.parse(raw) as ExtraccionCruda;

  const campos = LABELS.flatMap(([campo, label]) => {
    const v = cruda[campo];
    if (v === null || v === undefined || v === "") return [];
    return [{ label, value: String(v) }];
  });

  // Décision : illisible → RECHAZADO (le client doit re-soumettre) ; sinon VALIDADO
  // (les alertas restent visibles pour le gestor : caducado, recadré, etc.).
  const estado = cruda.legibilidad === "ilegible" ? "RECHAZADO" : "VALIDADO";

  return {
    estado,
    tipoDetectado: cruda.tipo_documento ?? "desconocido",
    confianzaGlobal: cruda.confianza_global ?? 0,
    legibilidad: cruda.legibilidad ?? "ilegible",
    campos,
    fechaCaducidad: typeof cruda.fecha_caducidad === "string" && cruda.fecha_caducidad ? cruda.fecha_caducidad : null,
    alertas: cruda.alertas ?? [],
    modelo: MODELO_EXTRACTION,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}
