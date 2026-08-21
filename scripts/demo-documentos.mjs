// Rellena con un PDF de EJEMPLO los documentos del workspace de DEMO que tienen
// estado (Validado, Procesando…) pero ningún fichero detrás.
//
// Por qué (21/08/2026): en la demo se veían documentos «Validado» SIN botón de
// descarga, porque `tieneArchivo = Boolean(storagePath)` y storagePath estaba vacío.
// El código está bien —los 89 documentos de clientes reales sí lo tienen— pero es
// justo la cuenta que se enseña a los prospectos: un despacho que ve un documento
// validado que no se puede descargar concluye que la función no existe.
//
// NO se falsifica ningún documento oficial: cada PDF dice claramente que es un
// ejemplo de demostración. Solo toca el workspace de demo; aborta si se le pide otro.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const WS_DEMO = "Gestoría Vallès";
const escribir = process.argv.includes("--escribir");

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function pdfEjemplo(etiqueta) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);                 // A4
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: rgb(0.06, 0.36, 0.27) });
  page.drawText("APROBA · DEMOSTRACIÓN", { x: 48, y: 795, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(etiqueta, { x: 48, y: 690, size: 24, font: bold, color: rgb(0.11, 0.16, 0.23) });
  const lineas = [
    "Este PDF es un EJEMPLO de la cuenta de demostración de Aproba.",
    "No es un documento oficial ni reproduce ninguno: sirve únicamente",
    "para mostrar cómo el despacho descarga las piezas que recibe.",
    "",
    "En una cuenta real, aquí estaría el documento que ha subido el",
    "cliente desde su enlace, o el que ha subido el propio despacho.",
  ];
  lineas.forEach((l, i) => page.drawText(l, { x: 48, y: 640 - i * 22, size: 12, font: normal, color: rgb(0.29, 0.33, 0.41) }));
  page.drawText("Documento de ejemplo — sin validez", { x: 48, y: 60, size: 10, font: normal, color: rgb(0.6, 0.64, 0.7) });
  return Buffer.from(await doc.save());
}

const { data: ws } = await a.from("Workspace").select("id, nombre").eq("nombre", WS_DEMO).maybeSingle();
if (!ws) { console.error(`workspace «${WS_DEMO}» no encontrado — abortado`); process.exit(1); }
const { data: exps } = await a.from("Expediente").select("id").eq("workspaceId", ws.id);
const ids = exps.map((e) => e.id);
const { data: docs } = await a.from("Documento").select("id, tipo, estado, expedienteId, storagePath").in("expedienteId", ids);
const huerfanos = docs.filter((d) => !d.storagePath && d.estado !== "PENDIENTE");

console.log(`${WS_DEMO}: ${docs.length} documentos · ${huerfanos.length} con estado pero sin fichero\n`);
const LABEL = { TARJETA_RESIDENCIA_TIE: "TIE actual", NOMINA: "Nómina", EMPADRONAMIENTO: "Certificado de empadronamiento",
  PASAPORTE: "Pasaporte", CONTRATO_TRABAJO: "Contrato de trabajo", LIBRO_FAMILIA: "Libro de familia",
  ANTECEDENTES_PENALES: "Antecedentes penales", CERTIFICADO_BANCARIO: "Certificado bancario",
  CERTIFICADO_NIE: "Certificado NIE", HOJA_ENCARGO: "Hoja de encargo", OTRO: "Documento" };

let hechos = 0;
for (const d of huerfanos) {
  const etiqueta = LABEL[d.tipo] ?? d.tipo;
  const ruta = `${d.expedienteId}/${d.tipo.toLowerCase()}-demo-${d.id.slice(0, 8)}.pdf`;
  if (!escribir) { console.log(`  (simulación) ${etiqueta.padEnd(32)} → ${ruta}`); hechos++; continue; }
  const buf = await pdfEjemplo(etiqueta);
  const { error: eUp } = await a.storage.from("documentos").upload(ruta, buf, { contentType: "application/pdf", upsert: true });
  if (eUp) { console.log(`  ⚠ ${etiqueta}: ${eUp.message}`); continue; }
  const { error: eDb } = await a.from("Documento")
    .update({ storagePath: ruta, mimeType: "application/pdf", nombreArchivo: `${etiqueta} (ejemplo).pdf` })
    .eq("id", d.id);
  if (eDb) { console.log(`  ⚠ ${etiqueta}: ${eDb.message}`); continue; }
  console.log(`  ✓ ${etiqueta.padEnd(32)} → ${ruta}`);
  hechos++;
}
console.log(`\n${escribir ? "rellenados" : "se rellenarían"}: ${hechos}`);
if (!escribir) console.log("(simulación — añade --escribir para hacerlo de verdad)");
