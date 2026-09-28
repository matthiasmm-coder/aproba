import { inflateRawSync } from "node:zlib";

// LECTOR ZIP mínimo SIN dependencias (28/09/2026), pareja de lib/zip.ts: lee el directorio
// central y extrae las entradas «store» (0) y «deflate» (8), que es lo que producen la DEHú,
// Windows y macOS al comprimir unos PDF. Solo servidor (Buffer + zlib).
//
// Defensas contra un ZIP trampa: como mucho `maxEntradas` archivos y `maxTotal` bytes
// descomprimidos; lo que exceda se ignora. Cifrado, ZIP64 o un método raro → se salta la
// entrada (no se rompe la importación entera).

export type EntradaZip = { nombre: string; datos: Buffer };

export function esZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;
}

export function leerZip(buf: Buffer, opts: { maxEntradas?: number; maxTotal?: number } = {}): EntradaZip[] {
  const maxEntradas = opts.maxEntradas ?? 50;
  const maxTotal = opts.maxTotal ?? 60 * 1024 * 1024;
  // Fin del directorio central: la firma 0x06054b50 en los últimos 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP no válido");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const salida: EntradaZip[] = [];
  let acumulado = 0;
  for (let n = 0; n < total && salida.length < maxEntradas; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(p + 8);
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const tamano = buf.readUInt32LE(p + 24);
    const lNombre = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + lNombre).toString(flags & 0x0800 ? "utf8" : "latin1");
    p += 46 + lNombre + lExtra + lComentario;
    const esCarpeta = nombre.endsWith("/");
    const cifrado = (flags & 0x0001) !== 0;
    if (esCarpeta || cifrado || comprimido === 0xffffffff || tamano === 0xffffffff) continue;
    if (acumulado + tamano > maxTotal) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const trozo = buf.subarray(inicio, inicio + comprimido);
    let datos: Buffer | null = null;
    try {
      if (metodo === 0) datos = Buffer.from(trozo);
      else if (metodo === 8) datos = inflateRawSync(trozo, { maxOutputLength: Math.max(1, tamano) });
    } catch { datos = null; }
    if (!datos || datos.length !== tamano) continue;
    acumulado += datos.length;
    salida.push({ nombre, datos });
  }
  return salida;
}
