// Validación de IBAN: estructura + dígito de control mod-97 (ISO 13616 / 7064).
// Evita que un IBAN mal tecleado pero con forma correcta llegue al email de
// factura del cliente final (que pagaría a una cuenta inexistente/ajena).

export const IBAN_EJEMPLO = "ES91 2100 0418 4502 0005 1332"; // checksum válido

export function fmtIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export function ibanValido(input: string): boolean {
  const iban = (input ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  // Mueve los 4 primeros al final, convierte letras (A=10…Z=35) y comprueba mod 97 === 1.
  const reordenado = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const ch of reordenado) {
    const code = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) resto = (resto * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return resto === 1;
}
