// ORDEN DE TRANSFERENCIAS SEPA — pain.001.001.03 (ISO 20022), módulo PURO (16/09/2026).
//
// Es el «cuaderno 34» actual de la banca española: todos los bancos lo importan desde su
// banca online (transferencias → importar fichero). Aproba solo ESCRIBE el fichero con el
// despacho como ordenante y las facturas recibidas como transferencias; el dinero lo mueve
// el banco cuando el gestor lo valida. Sin licencia, sin fondos en tránsito.

export type TransferenciaSepa = { endToEndId: string; importe: number; acreedor: string; iban: string; concepto: string };
export type OrdenSepa = {
  msgId: string;
  creado: Date;
  ordenante: { nombre: string; nif?: string | null; iban: string };
  fechaEjecucion: string; // AAAA-MM-DD
  transferencias: TransferenciaSepa[];
};

export const limpiarIban = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 34);

// Validación ISO 13616 (mod 97) + longitud española (24). Otros países: solo mod 97.
export function ibanValido(v: string): boolean {
  const iban = limpiarIban(v);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("ES") && iban.length !== 24) return false;
  const reordenado = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const ch of reordenado) {
    const trozo = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of trozo) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1;
}

export const fmtIban = (v: string): string => limpiarIban(v).replace(/(.{4})/g, "$1 ").trim();

// Juego de caracteres SEPA (EPC): letras sin acento, dígitos y / - ? : ( ) . , ' + espacio.
export function textoSepa(s: string, max: number): string {
  const sin = s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ").replace(/\s+/g, " ").trim();
  return (sin || "-").slice(0, max);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const imp = (n: number) => n.toFixed(2);

export function totalOrden(o: Pick<OrdenSepa, "transferencias">): number {
  return Math.round(o.transferencias.reduce((s, t) => s + t.importe, 0) * 100) / 100;
}

// Errores de datos ANTES de escribir nada: un fichero rechazado por el banco es peor que
// un aviso claro aquí.
export function validarOrden(o: OrdenSepa): string[] {
  const errores: string[] = [];
  if (!ibanValido(o.ordenante.iban)) errores.push("El IBAN del despacho no es válido.");
  if (!o.ordenante.nombre.trim()) errores.push("Falta el nombre del despacho (ordenante).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.fechaEjecucion)) errores.push("Fecha de ejecución no válida.");
  if (!o.transferencias.length) errores.push("No hay transferencias.");
  for (const t of o.transferencias) {
    if (!(t.importe > 0)) errores.push(`${t.acreedor || t.endToEndId}: importe no válido.`);
    if (!ibanValido(t.iban)) errores.push(`${t.acreedor || t.endToEndId}: IBAN no válido.`);
    if (!t.acreedor.trim()) errores.push(`${t.endToEndId}: falta el nombre del proveedor.`);
  }
  return errores;
}

export function generarPain001(o: OrdenSepa): string {
  const n = o.transferencias.length;
  const total = imp(totalOrden(o));
  const creDtTm = o.creado.toISOString().slice(0, 19);
  const nif = o.ordenante.nif ? limpiarIban(o.ordenante.nif) : "";
  const cabecera = `  <GrpHdr>
    <MsgId>${xml(textoSepa(o.msgId, 35))}</MsgId>
    <CreDtTm>${creDtTm}</CreDtTm>
    <NbOfTxs>${n}</NbOfTxs>
    <CtrlSum>${total}</CtrlSum>
    <InitgPty>
      <Nm>${xml(textoSepa(o.ordenante.nombre, 70))}</Nm>${nif ? `\n      <Id><OrgId><Othr><Id>${xml(nif)}</Id></Othr></OrgId></Id>` : ""}
    </InitgPty>
  </GrpHdr>`;
  const txs = o.transferencias.map((t) => `    <CdtTrfTxInf>
      <PmtId><EndToEndId>${xml(textoSepa(t.endToEndId, 35))}</EndToEndId></PmtId>
      <Amt><InstdAmt Ccy="EUR">${imp(t.importe)}</InstdAmt></Amt>
      <CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>
      <Cdtr><Nm>${xml(textoSepa(t.acreedor, 70))}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${limpiarIban(t.iban)}</IBAN></Id></CdtrAcct>
      <RmtInf><Ustrd>${xml(textoSepa(t.concepto, 140))}</Ustrd></RmtInf>
    </CdtTrfTxInf>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<CstmrCdtTrfInitn>
${cabecera}
  <PmtInf>
    <PmtInfId>${xml(textoSepa(o.msgId, 35))}</PmtInfId>
    <PmtMtd>TRF</PmtMtd>
    <BtchBookg>false</BtchBookg>
    <NbOfTxs>${n}</NbOfTxs>
    <CtrlSum>${total}</CtrlSum>
    <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
    <ReqdExctnDt>${o.fechaEjecucion}</ReqdExctnDt>
    <Dbtr><Nm>${xml(textoSepa(o.ordenante.nombre, 70))}</Nm></Dbtr>
    <DbtrAcct><Id><IBAN>${limpiarIban(o.ordenante.iban)}</IBAN></Id></DbtrAcct>
    <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>
    <ChrgBr>SLEV</ChrgBr>
${txs}
  </PmtInf>
</CstmrCdtTrfInitn>
</Document>
`;
}
