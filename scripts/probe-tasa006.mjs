// Probe de la tasa 790-006 (antecedentes penales): descarga un ejemplar oficial FRESCO de
// la Sede de Justicia, lo rellena con datos marcados («V…») y COMPRUEBA que cada valor
// aparece en el PDF y en la fila que le toca. A lanzar antes de tocar el mapping:
//   node --loader ./scripts/ts-loader.mjs scripts/probe-tasa006.mjs [carpetaSalida]
import { descargarPlantilla006, rellenarTasa006 } from "../lib/tasa790006.ts";
import { writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "node:path";

const out = process.argv[2] ?? ".";
const plantilla = await descargarPlantilla006();
console.log(`plantilla oficial: ${plantilla.length} octets`);

const c = {
  numId: "Y1234567X",
  apellido1: "VAPELLIDO", apellido2: "VSEGUNDO", nombre: "VNOMBRE",
  domicilio: "VCALLE MALLORCA", numero: "245", escalera: "B", piso: "3", puerta: "2",
  municipio: "VBARCELONA", provincia: "VPROVINCIA", pais: "España", cp: "08013",
  telefono: "600111222", email: "v@correo.es",
  fechaNac: "07/03/1990",
  poblacionNac: "VBOGOTA", provinciaNac: "VCOLOMBIA", nacionalidad: "VCOLOMBIANA",
  nombrePadre: "VPADRE", nombreMadre: "VMADRE", finalidad: "VTRAMITE DE EXTRANJERIA",
  importe: "3,86", firmaLugar: "VLUGAR", firmaFecha: "18/09/2026",
};
const buf = await rellenarTasa006(plantilla, c);
const pdf = path.join(out, "probe-tasa006.pdf");
await writeFile(pdf, buf);

const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
const items = (await (await doc.getPage(1)).getTextContent()).items.filter((i) => i.str?.trim());
const txt = items.map((i) => i.str).join(" ");
const faltan = [];
for (const [k, v] of Object.entries(c)) if (typeof v === "string" && v.startsWith("V") && !txt.includes(v)) faltan.push(`${k}=${v}`);
for (const v of ["3,86", "08013", "07/03/1990", "600111222", "septiembre"]) if (!txt.includes(v)) faltan.push(`literal:${v}`);
// El año va dígito a dígito en las casillas «Devengo · Ejercicio» (no como «2026»).
const ejercicio = items.filter((i) => Math.abs(i.transform[5] - 711) < 4 && i.transform[4] > 400).sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str.trim()).join("");
if (ejercicio !== "2026") faltan.push(`ejercicio="${ejercicio}" (esperado 2026)`);
// Bandas del impreso (medidas sobre el oficial): el mismo dato se estampa DOS veces —
// arriba el solicitante, en medio el bloque B (persona del certificado). Se comprueban
// todas las apariciones, no la primera: así un valor que solo llegue a un bloque salta.
const filas = (v) => items.filter((x) => x.str.includes(v)).map((x) => Math.round(x.transform[5]));
const enBanda = (ys, lo, hi) => ys.some((y) => y >= lo && y <= hi);
const bandas = [
  ["VAPELLIDO", [[615, 628], [408, 420]]],   // solicitante (2) + bloque B (23)
  ["VNOMBRE", [[615, 628], [380, 394]]],     // solicitante (4) + bloque B (25)
  ["VCALLE MALLORCA", [[588, 602]]],
  ["VBARCELONA", [[560, 574]]],
  ["VBOGOTA", [[380, 394]]], ["VCOLOMBIANA", [[353, 367]]],
  ["VPADRE", [[353, 367]]], ["VMADRE", [[325, 339]]],
  ["VTRAMITE DE EXTRANJERIA", [[325, 339]]],
  ["VLUGAR", [[134, 148]]],
];
for (const [v, rangos] of bandas) {
  const ys = filas(v);
  for (const [lo, hi] of rangos) if (!enBanda(ys, lo, hi)) faltan.push(`${v} no aparece en la fila ${lo}-${hi} (visto en ${ys.join(",") || "ninguna"})`);
}
// Las «X» estampadas al aplanar: 3 copias (Administración / Interesado / Entidad) por
// casilla marcada — antecedentes penales, «correo postal: No» y «pago en efectivo».
{
  const equis = items.filter((i) => i.str.trim() === "X").map((i) => [Math.round(i.transform[4]), Math.round(i.transform[5])]);
  const cerca = (x, y) => equis.some(([a, b]) => Math.abs(a - x) <= 6 && Math.abs(b - y) <= 6);
  for (const [n, x, y] of [["17 antecedentes penales", 174, 518], ["correo postal: No", 137, 168], ["pago en efectivo", 404, 143]])
    if (!cerca(x, y)) faltan.push(`X de «${n}» no estampada (${x},${y}); vistas: ${equis.map((e) => e.join(",")).join(" · ") || "ninguna"}`);
}
// Y en el ejemplar EDITABLE, las casillas siguen siendo campos vivos con su valor.
{
  const { PDFDocument } = await import("pdf-lib");
  const vivo = await PDFDocument.load(await rellenarTasa006(plantilla, c, { editable: true }), { ignoreEncryption: true });
  const f = vivo.getForm();
  const estado = (n) => { try { return f.getCheckBox(n).isChecked(); } catch { return "AUSENTE"; } };
  if (estado("17 Antecedentes Penales") !== true) faltan.push("casilla 17 (antecedentes penales) sin marcar");
  if (estado("18 Últimas voluntades") !== false) faltan.push("casilla 18 marcada por error");
  if (estado("19 Contrato de seguros de cobertura de") !== false) faltan.push("casilla 19 marcada por error");
  if (estado("DENEGAR") !== true) faltan.push("«envío por correo postal: No» sin marcar");
  if (estado("Casilla de verificación7") !== true) faltan.push("forma de pago (efectivo) sin marcar");
}

console.log(faltan.length ? `❌ ${faltan.length}: ${faltan.join(" · ")}` : `✅ tasa 790-006 OK · ${pdf}`);
process.exit(faltan.length ? 1 : 0);
