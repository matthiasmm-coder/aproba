import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { crearZip } from "@/lib/zip";
import { esZip, leerZip } from "@/lib/zip-leer";

// Un ZIP con UNA entrada comprimida «deflate» (lo que hace Windows/macOS), escrito a mano.
function zipDeflate(nombre: string, datos: Buffer): Buffer {
  const comp = deflateRawSync(datos);
  const n = Buffer.from(nombre, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(datos.length, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(datos.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const cuerpo = Buffer.concat([local, n, comp]);
  const dir = Buffer.concat([central, n]);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10); fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(cuerpo.length, 16);
  return Buffer.concat([cuerpo, dir, fin]);
}

describe("lector ZIP", () => {
  it("lee las entradas «store» que escribe lib/zip", () => {
    const zip = crearZip([{ name: "notificacion.pdf", data: new Uint8Array(Buffer.from("%PDF-1.4 uno")) }, { name: "acuse.pdf", data: new Uint8Array(Buffer.from("%PDF-1.4 dos")) }]);
    expect(esZip(zip)).toBe(true);
    const e = leerZip(zip);
    expect(e.map((x) => x.nombre)).toEqual(["notificacion.pdf", "acuse.pdf"]);
    expect(e[1].datos.toString()).toBe("%PDF-1.4 dos");
  });
  it("lee una entrada «deflate» con nombre en UTF-8", () => {
    const pdf = Buffer.from("%PDF-1.4 " + "requerimiento ".repeat(200));
    const e = leerZip(zipDeflate("Notificación 1.pdf", pdf));
    expect(e).toHaveLength(1);
    expect(e[0].nombre).toBe("Notificación 1.pdf");
    expect(e[0].datos.equals(pdf)).toBe(true);
  });
  it("respeta el tope de tamaño descomprimido y rechaza lo que no es ZIP", () => {
    const grande = zipDeflate("grande.pdf", Buffer.alloc(5000, 65));
    expect(leerZip(grande, { maxTotal: 1000 })).toHaveLength(0);
    expect(esZip(Buffer.from("%PDF-1.4"))).toBe(false);
    expect(() => leerZip(Buffer.from("no es un zip"))).toThrow();
  });
});
