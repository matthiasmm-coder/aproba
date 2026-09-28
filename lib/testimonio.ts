// Cita del testimonio que se escribe letra a letra (components/testimonio-escrito.tsx).
// Lógica pura aparte del componente: vitest no transforma JSX.

export type ParteCita = { t: string; marca?: boolean };

// Reparte los n primeros caracteres entre las partes: lo escrito y lo pendiente de cada una.
// Lo pendiente se pinta en transparente: así ninguna línea cambia mientras se escribe.
export function repartir(partes: ParteCita[], n: number): { escrito: string; pendiente: string; marca?: boolean }[] {
  let resto = Math.max(0, n);
  return partes.map((p) => {
    const k = Math.min(p.t.length, resto);
    resto -= k;
    return { escrito: p.t.slice(0, k), pendiente: p.t.slice(k), marca: p.marca };
  });
}
