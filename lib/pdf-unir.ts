import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, StandardFonts } from "pdf-lib";

// pdf-lib, al APLANAR un campo creado por él mismo (widget hijo del campo, como los 30 del
// mandato general del Consejo), borra el widget pero deja su referencia en /Annots de la
// página: 30 referencias muertas en el PDF que recibe el cliente (visto el 27/09/2026).
// Aperçu lo tolera; Acrobat puede avisar de un error en la página. Se limpian aquí.
export function quitarAnotacionesMuertas(pdf: PDFDocument): number {
  let n = 0;
  for (const pagina of pdf.getPages()) {
    const annots = pagina.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const ref = annots.get(i);
      if (ref instanceof PDFRef && pdf.context.lookup(ref) === undefined) { annots.remove(i); n++; }
    }
    if (annots.size() === 0) pagina.node.delete(PDFName.of("Annots"));
  }
  return n;
}

// Varios PDF en UNO, páginas en orden (27/09/2026: los mandatos de un expediente
// multi-servicio — extranjería + general, por ejemplo — salen en un solo archivo que el
// cliente firma página a página y sube de una vez).
//
// editable: los campos AcroForm de cada parte se CONSERVAN, renombrados con el prefijo de su
// parte. Dos impresos del Consejo comparten nombres («Dña», «DNI», «CP»…): sin prefijo, los
// visores los tratarían como el mismo campo y escribir en uno cambiaría el otro.
// Sin editable, se aplanan (lo que va al cliente).
export async function unirPdfs(partes: { bytes: Uint8Array; prefijo: string }[], opts: { editable: boolean }): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const raices: PDFRef[] = [];
  const vistos = new Set<string>();
  for (const parte of partes) {
    const src = await PDFDocument.load(parte.bytes);
    const form = src.getForm();
    if (opts.editable) {
      for (const f of form.getFields()) f.acroField.dict.set(PDFName.of("T"), PDFHexString.fromText(`${parte.prefijo}${f.getName()}`));
    } else if (form.getFields().length) {
      form.flatten();
      quitarAnotacionesMuertas(src);
    }
    for (const pagina of await out.copyPages(src, src.getPageIndices())) {
      out.addPage(pagina);
      if (!opts.editable) continue;
      const annots = pagina.node.Annots();
      for (let i = 0; annots && i < annots.size(); i++) {
        const ref = annots.get(i);
        const widget = out.context.lookup(ref);
        if (!(widget instanceof PDFDict) || widget.get(PDFName.of("Subtype")) !== PDFName.of("Widget")) continue;
        // El campo RAÍZ: el propio widget (fusionado con su campo) o el último /Parent.
        let raiz = ref instanceof PDFRef ? ref : null;
        let d: PDFDict = widget;
        for (let n = 0; n < 8 && d.get(PDFName.of("Parent")); n++) {
          const p = d.get(PDFName.of("Parent"));
          if (p instanceof PDFRef) raiz = p;
          const pd = out.context.lookup(p);
          if (!(pd instanceof PDFDict)) break;
          d = pd;
        }
        if (raiz && !vistos.has(raiz.toString())) { vistos.add(raiz.toString()); raices.push(raiz); }
      }
    }
  }
  if (opts.editable && raices.length) {
    // /DR con Helvetica: sin él, un visor no sabría con qué fuente redibujar lo que se escribe.
    const helv = await out.embedFont(StandardFonts.Helvetica);
    const acro = out.context.obj({ Fields: raices, DA: PDFString.of("/Helv 0 Tf 0 g"), DR: { Font: { Helv: helv.ref } } });
    out.catalog.set(PDFName.of("AcroForm"), out.context.register(acro));
  }
  return out.save();
}
