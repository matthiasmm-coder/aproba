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
Devuelve únicamente el objeto JSON que cumple el esquema proporcionado. Nada de texto adicional, ni explicaciones, ni markdown.
REGLA ABSOLUTA: devuelve el JSON SIEMPRE, también cuando la imagen esté vacía, en blanco, borrosa, cortada o no sea un documento. En esos casos: tipo_documento "desconocido", legibilidad "ilegible", y en alertas el motivo CONCRETO y qué debe hacer el cliente. Ejemplos: "La foto está borrosa: vuelve a hacerla con el móvil quieto y buena luz", "Solo se ve media página: sube el documento completo", "La imagen no contiene ningún documento: comprueba que has subido el archivo correcto". NUNCA respondas con una frase fuera del JSON.`;

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

// Repli quand le modèle n'a pas renvoyé de JSON exploitable : on rend un résultat VALIDE
// marqué RECHAZADO. Le document est enregistré, le client voit quoi refaire, et le gestor
// garde la trace — au lieu d'un 502 qui perd l'upload et ne dit rien à personne.
function respuestaIlegible(raw: string, inputTokens: number, outputTokens: number): ResultadoExtraccion {
  console.error("[extraction] respuesta no-JSON del modelo:", raw.slice(0, 300));
  return {
    estado: "RECHAZADO",
    tipoDetectado: "desconocido",
    confianzaGlobal: 0,
    legibilidad: "ilegible",
    campos: [],
    fechaCaducidad: null,
    alertas: ["No se ha podido leer el documento. Haz una foto más nítida, con buena luz y el documento completo dentro del encuadre."],
    modelo: MODELO_EXTRACTION,
    inputTokens,
    outputTokens,
  };
}

// Una foto de móvil llega a 12-16k tokens de imagen (el 70 % del coste IA medido el
// 13/08). Por encima de ~1568 px de lado la API reduce igualmente la imagen: mandarla
// entera solo paga tokens de más. Se reencuadra aquí (EXIF incluido) y se recomprime.
// Fail-soft: si sharp falla con un fichero raro, se manda el original — nunca se pierde
// un upload por optimizar. Los PDF no se tocan.
async function prepararImagen(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buffer)
      .rotate() // aplica la orientación EXIF (las fotos de móvil vienen giradas)
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    // Si la "optimización" engorda el fichero (imagen ya pequeña y muy comprimida), gana el original.
    return out.length < buffer.length ? { buffer: out, mimeType: "image/jpeg" } : { buffer, mimeType };
  } catch (e) {
    console.warn("[extraction] prepararImagen falló, se envía el original:", e instanceof Error ? e.message : e);
    return { buffer, mimeType };
  }
}

export async function extraerDocumento(buffer: Buffer, mimeType: string): Promise<ResultadoExtraccion> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY en .env.local — la validación IA no está configurada.");
  }
  if (mimeType !== "application/pdf" && !MEDIA_IMAGEN.has(mimeType)) {
    throw new Error(`Formato no soportado: ${mimeType}`);
  }
  const client = new Anthropic();

  const esPdf = mimeType === "application/pdf";
  const img = esPdf ? { buffer, mimeType } : await prepararImagen(buffer, mimeType);
  const b64 = img.buffer.toString("base64");

  const docBlock = esPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: b64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: img.mimeType as "image/jpeg" | "image/png" | "image/webp", data: b64 } };

  // Prompt caching: el texto fijo va ANTES del documento para que el prefijo estable
  // (SYSTEM + instrucción + plantilla) sea idéntico en TODAS las extracciones y se
  // sirva de la caché (~10 % del precio). La imagen, única por documento, va al final.
  const res = await client.messages.create({
    model: MODELO_EXTRACTION,
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extrae los datos del documento adjunto a continuación y rellena EXACTAMENTE esta estructura JSON (usa null donde no aplique o no se lea, fechas en AAAA-MM-DD). Devuelve SOLO el JSON, sin markdown ni explicaciones:\n\n${PLANTILLA_JSON}`,
            cache_control: { type: "ephemeral" },
          },
          docBlock,
        ],
      },
    ],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  const texto = res.content.find((b) => b.type === "text");
  let raw = (texto && "text" in texto ? texto.text : "{}").trim();
  // défense : retirer d'éventuelles clôtures markdown ```json … ```
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Le modèle répond parfois en PROSE au lieu du JSON — typiquement quand la photo est
  // floue, sombre ou vide : « No he recibido ninguna imagen… ». Un JSON.parse nu levait
  // alors une exception qui remontait jusqu'à la route → 502 → **le document n'était
  // jamais enregistré** et le client rebouclait sans comprendre. C'est le bug signalé
  // par Juan le 06/08/2026 (« otro cliente no puede cargar documentos »), reproduit en
  // production. Un document illisible est un cas NORMAL du métier : il doit finir en
  // RECHAZADO avec un message clair, jamais en erreur serveur.
  let cruda: ExtraccionCruda;
  try {
    cruda = JSON.parse(raw) as ExtraccionCruda;
  } catch {
    // 2e chance : le modèle a pu préfixer le JSON d'une phrase. On isole le 1er objet.
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        cruda = JSON.parse(m[0]) as ExtraccionCruda;
      } catch {
        return respuestaIlegible(raw, res.usage.input_tokens, res.usage.output_tokens);
      }
    } else {
      return respuestaIlegible(raw, res.usage.input_tokens, res.usage.output_tokens);
    }
  }

  const campos = LABELS.flatMap(([campo, label]) => {
    const v = cruda[campo];
    if (v === null || v === undefined || v === "") return [];
    return [{ label, value: String(v) }];
  });

  // Décision : illisible → RECHAZADO (le client doit re-soumettre) ; sinon VALIDADO
  // (les alertas restent visibles pour le gestor : caducado, recadré, etc.).
  // La legibilidad se resuelve ANTES: un null del modelo contaba como "ilegible" en el
  // resultado pero VALIDABA el documento (el check miraba cruda.legibilidad, no el repli).
  const legibilidad = cruda.legibilidad ?? "ilegible";
  const estado = legibilidad === "ilegible" ? "RECHAZADO" : "VALIDADO";

  // Un rechazo SIEMPRE lleva un motivo accionable. El prompt ya lo exige; esto es el
  // filet si el modelo devuelve ilegible con alertas vacías — el cliente debe saber
  // qué ha fallado y qué reenviar, no ver un rechazo mudo.
  const alertas = (Array.isArray(cruda.alertas) ? cruda.alertas : []).filter((a): a is string => typeof a === "string" && !!a.trim());
  if (estado === "RECHAZADO" && !alertas.length) {
    alertas.push("No se ha podido leer el documento. Vuelve a subirlo: foto nítida, con buena luz y el documento completo dentro del encuadre.");
  }

  return {
    estado,
    tipoDetectado: cruda.tipo_documento ?? "desconocido",
    confianzaGlobal: cruda.confianza_global ?? 0,
    legibilidad,
    campos,
    fechaCaducidad: typeof cruda.fecha_caducidad === "string" && cruda.fecha_caducidad ? cruda.fecha_caducidad : null,
    alertas,
    modelo: MODELO_EXTRACTION,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}
