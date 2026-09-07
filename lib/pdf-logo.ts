import "server-only";
import type { PDFDocument, PDFImage } from "pdf-lib";

// Logo del despacho dentro de un PDF (08/09/2026). Existía el campo en Ajustes y se
// pintaba en la vista web de la factura, pero NO en los PDF — que es justo lo que
// recibe el cliente. Reportado por un despacho en Ayuda.
//
// pdf-lib solo embebe PNG y JPEG. El subidor acepta además WebP, así que ese caso se
// convierte con sharp (ya es dependencia del proyecto). Cualquier fallo — red, formato
// raro, imagen corrupta — devuelve null: un documento sin logo, nunca un 500.

const MAX_BYTES = 2 * 1024 * 1024; // el mismo tope que aplica el subidor

export async function embeberLogo(doc: PDFDocument, url?: string | null): Promise<PDFImage | null> {
  const u = (url ?? "").trim();
  if (!u) return null;
  try {
    const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    // Se mira la firma del fichero, no la extensión de la URL (lleva ?v= y puede mentir).
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
    const esWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45;
    if (esWebp) {
      const sharp = (await import("sharp")).default;
      const png = await sharp(Buffer.from(bytes)).png().toBuffer();
      return await doc.embedPng(new Uint8Array(png));
    }
    return null;
  } catch {
    return null;
  }
}

// Tamaño respetando la proporción, sin ampliar nunca una imagen pequeña.
export function medidasLogo(img: PDFImage, maxAncho: number, maxAlto: number): { ancho: number; alto: number } {
  const k = Math.min(maxAncho / img.width, maxAlto / img.height, 1);
  return { ancho: img.width * k, alto: img.height * k };
}
