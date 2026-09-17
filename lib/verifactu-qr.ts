import "server-only";
import QRCode from "qrcode";

// Código QR tributario (art. 21 Orden HAC/1177/2024): contiene la URL de verificación de
// la AEAT que devuelve Verifacti; en papel debe medir entre 30 y 40 mm e ir acompañado de
// la leyenda. Se genera aquí (y no se guarda) a partir de la URL registrada.
export const LEYENDA_VERIFACTU = "Factura verificable en la sede electrónica de la AEAT";
export const TITULO_QR = "QR tributario";

const OPCIONES = { errorCorrectionLevel: "M" as const, margin: 1, width: 300 };

export async function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...OPCIONES, type: "png" });
}

export async function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, OPCIONES);
}
