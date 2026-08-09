// Fecha tecleada a mano (dd/mm/aaaa) ↔ ISO (AAAA-MM-DD).
//
// Lógica pura, aparte del componente: se puede probar sin montar React y la usa
// también quien necesite validar una fecha escrita.

export const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "").slice(0, 8);

// "15031990" → "15/03/1990" (las barras aparecen al llegar a ellas, no antes).
export function conBarras(d: string): string {
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function visualDesdeIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// 8 cifras → ISO, solo si la fecha EXISTE de verdad (el 31/02 no pasa). Una fecha a
// medias devuelve "" para que la validación de campos obligatorios no la dé por buena.
export function isoDesdeDigitos(d: string): string {
  if (d.length !== 8) return "";
  const dia = Number(d.slice(0, 2)), mes = Number(d.slice(2, 4)), ano = Number(d.slice(4));
  if (!dia || !mes || mes > 12 || ano < 1900) return "";
  const f = new Date(Date.UTC(ano, mes - 1, dia));
  if (f.getUTCFullYear() !== ano || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return "";
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}
