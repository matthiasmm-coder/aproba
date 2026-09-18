// Deriva del propio PDF oficial el bloque «DATOS DEL REPRESENTANTE A EFECTOS DE
// PRESENTACIÓN DE LA SOLICITUD»: la sección donde va el DESPACHO que presenta.
// Ojo: NO es la casilla «Representante legal, en su caso» de la sección 1, que el
// Ministerio reserva al representante legal del EXTRANJERO (la EX-11 la titula
// «Representante legal (menor/tutelado…)»).
//   node --loader ./scripts/ts-loader.mjs scripts/derivar-presentador.mjs [EX-17 …]
// Pegar la salida en PRESENTADOR (lib/ex-forms.ts) y auditar con npm run audit:forms.
import { readFileSync, readdirSync } from "node:fs";
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const r1 = (v) => Math.round(v * 10) / 10;
const BORDE = 545; // margen derecho del marco impreso
const RX = {
  nombre: /^Nombre\/Raz[oó]n Social/i, domicilio: /^Domicilio/i, numero: /^N[ºo]\.?$/,
  piso: /^Piso/i, localidad: /^Localidad/i, cp: /^C\.P\./i, provincia: /^Provincia/i,
  telefono: /^Tel[eé]fono|^Tf\. m[oó]vil/i, email: /^E-?mail/i, repNombre: /^Representante legal/i, titulo: /^T[ií]tulo/i,
};
const codes = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync("forms/ex").filter((f) => f.endsWith(".pdf")).map((f) => f.replace(".pdf", "")).sort();
for (const code of codes) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(`forms/ex/${code}.pdf`)), useSystemFonts: true }).promise;
  const items = (await (await doc.getPage(1)).getTextContent()).items.filter((i) => i.str?.trim())
    .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width ?? 0 }));
  const cab = items.find((i) => /REPRESENTANTE A (LOS )?EFECTOS DE PRESENTACI/i.test(i.s));
  if (!cab) { console.log(`  // ${code}: sin sección de representante que presenta`); continue; }
  // La sección acaba en la cabecera siguiente («4) DOMICILIO A EFECTOS…»).
  const siguiente = items.filter((i) => i.y < cab.y - 5 && /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /,.()-]{14,}$/.test(i.s) && i.x < 120).sort((a, b) => b.y - a.y)[0];
  const tope = siguiente ? siguiente.y + 8 : 0;
  const dentro = items.filter((i) => i.y < cab.y - 5 && i.y > tope);
  // Las llamadas a nota «(4)» se imprimen pegadas al rótulo y un poco más altas: el hueco
  // empieza DESPUÉS de ellas, o el campo editable las tapa (EX-17, EX-21, EX-23, EX-24).
  const finReal = (et) => {
    let fin = et.x + et.w;
    for (const n of items) {
      if (!/^\(\d\)$/.test(n.s)) continue;
      if (Math.abs(n.y - et.y) > 8) continue;
      if (n.x < fin - 1 || n.x > fin + 8) continue;
      fin = Math.max(fin, n.x + n.w);
    }
    return fin;
  };
  // Cada fila: los rótulos a la misma y; el hueco va del final de un rótulo al inicio del siguiente.
  const filas = new Map();
  for (const i of dentro) { const k = Math.round(i.y); const cerca = [...filas.keys()].find((y) => Math.abs(y - k) < 4); (filas.get(cerca ?? k) ?? filas.set(k, []).get(k)).push(i); }
  const campos = {};
  for (const [, fila] of filas) {
    const orden = fila.sort((a, b) => a.x - b.x);
    for (let n = 0; n < orden.length; n++) {
      const et = Object.entries(RX).find(([, rx]) => rx.test(orden[n].s));
      if (!et) continue;
      const clave = et[0] === "repNombre" && campos.nombre ? "repNombre" : et[0];
      const fin = finReal(orden[n]);
      // El rótulo siguiente puede venir en una línea partida («Teléfono» / «móvil» con
      // «E-mail» en medio, EX-03): se busca en una banda de ±8 pt, no solo en la fila.
      const sig = dentro.filter((o) => Math.abs(o.y - orden[n].y) <= 8 && o.x > fin + 2 && !/^\(\d\)$/.test(o.s))
        .sort((a, b) => a.x - b.x)[0];
      campos[clave] = { x: r1(fin + 4), y: r1(orden[n].y - 1.9), w: r1((sig ? sig.x : BORDE) - fin - 9) };
      if (clave === "nombre") { // en esa fila, el DNI/NIE/PAS es el del despacho que presenta
        const dni = orden.slice(n + 1).find((o) => /^(DNI|NIE|NIF)/i.test(o.s));
        if (dni) campos.documento = { x: r1(finReal(dni) + 4), y: r1(dni.y - 1.9), w: r1(BORDE - finReal(dni) - 9) };
      }
      if (clave === "repNombre") { // en esa fila, DNI/NIE/PAS y Título son del representante legal
        const dni = orden.slice(n + 1).find((o) => /^(DNI|NIE|NIF)/i.test(o.s));
        const tit = orden.slice(n + 1).find((o) => /^T[ií]tulo/i.test(o.s));
        if (dni) campos.repDoc = { x: r1(finReal(dni) + 4), y: r1(dni.y - 1.9), w: r1((tit ? tit.x : BORDE) - finReal(dni) - 9) };
        if (tit) campos.repTitulo = { x: r1(finReal(tit) + 4), y: r1(tit.y - 1.9), w: r1(BORDE - finReal(tit) - 9) };
        break;
      }
    }
  }
  delete campos.titulo;
  const faltan = ["nombre", "documento", "domicilio", "localidad", "cp", "provincia", "telefono", "email"].filter((k) => !campos[k] && k !== "documento");
  const orden = ["nombre", "documento", "domicilio", "numero", "piso", "localidad", "cp", "provincia", "telefono", "email", "repNombre", "repDoc", "repTitulo"];
  const cuerpo = orden.filter((k) => campos[k]).map((k) => `${k}: { x: ${campos[k].x}, y: ${campos[k].y}, w: ${campos[k].w} }`).join(", ");
  console.log(`  "${code}": { ${cuerpo} },${faltan.length ? "  // ⚠️ faltan " + faltan.join(",") : ""}`);
}
