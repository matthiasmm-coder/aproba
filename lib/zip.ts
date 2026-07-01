// ZIP writer minimal SIN dependencias (método "store", sin compresión). Suficiente para
// empaquetar PDFs e imágenes (ya comprimidos) en un único .zip. Solo servidor (usa Buffer).
// Formato ZIP clásico (32-bit): local file headers + central directory + EOCD, little-endian.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

// Nombre de archivo seguro para el zip (sin caracteres problemáticos).
export function nombreSeguro(s: string): string {
  return (s || "archivo").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "archivo";
}

export function crearZip(entries: ZipEntry[]): Buffer {
  const locales: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const data = Buffer.from(e.data);
    const crc = crc32(data);
    const size = data.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);       // local file header signature
    lfh.writeUInt16LE(20, 4);               // version needed
    lfh.writeUInt16LE(0x0800, 6);           // flags: nombre en UTF-8 (bit 11)
    lfh.writeUInt16LE(0, 8);                // método: store
    lfh.writeUInt16LE(0, 10);               // hora
    lfh.writeUInt16LE(0x21, 12);            // fecha DOS 1980-01-01
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(size, 18);            // tamaño comprimido
    lfh.writeUInt32LE(size, 22);            // tamaño sin comprimir
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);               // extra length
    locales.push(lfh, nameBuf, data);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);       // central directory header signature
    cdh.writeUInt16LE(20, 4);               // version made by
    cdh.writeUInt16LE(20, 6);               // version needed
    cdh.writeUInt16LE(0x0800, 8);           // flags: UTF-8
    cdh.writeUInt16LE(0, 10);               // método: store
    cdh.writeUInt16LE(0, 12);               // hora
    cdh.writeUInt16LE(0x21, 14);            // fecha
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(size, 20);
    cdh.writeUInt32LE(size, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);               // extra
    cdh.writeUInt16LE(0, 32);               // comment
    cdh.writeUInt16LE(0, 34);               // disk number
    cdh.writeUInt16LE(0, 36);               // internal attrs
    cdh.writeUInt32LE(0, 38);               // external attrs
    cdh.writeUInt32LE(offset, 42);          // offset del local header
    central.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);        // end of central directory signature
  eocd.writeUInt16LE(0, 4);                 // disk
  eocd.writeUInt16LE(0, 6);                 // disk con central dir
  eocd.writeUInt16LE(entries.length, 8);    // entradas en este disco
  eocd.writeUInt16LE(entries.length, 10);   // total entradas
  eocd.writeUInt32LE(centralBuf.length, 12);// tamaño central dir
  eocd.writeUInt32LE(offset, 16);           // offset central dir
  eocd.writeUInt16LE(0, 20);                // comment length

  return Buffer.concat([...locales, centralBuf, eocd]);
}
