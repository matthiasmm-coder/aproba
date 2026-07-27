// VENTANA DE CUOTA — el mes de expedientes incluidos NO es el mes natural, sino el
// CICLO DE FACTURACIÓN: cuenta desde el día en que el despacho paga. Quien empezó a
// pagar el 17 tiene su cuota del 17 al 16 del mes siguiente; con el mes natural, quien
// se daba de alta el 28 estrenaba plan y solo tenía 3 días de cuota antes del reset.
//
// Módulo PURO (sin server-only): lo comparten lib/overage.ts (decisión de cobro,
// servidor) y el contador que ve el gestor al crear un expediente (cliente). La clave
// resultante ('AAAA-MM-DD' = primer día del ciclo) es la que indexa UsoMensual.

export type SubCiclo = {
  currentPeriodEnd?: string | null; // fin del periodo facturado (Stripe) — la fuente más fiable
  trialEndsAt?: string | null;      // aún en prueba: el día en que se cobrará
};

const diasEnMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();

const diaDe = (iso?: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getUTCDate();
};

// Día del mes en que se renueva la cuota. Prioridad: periodo facturado por Stripe →
// fin de la prueba (será el 1er cobro) → día 1 (sin datos, equivale al mes natural).
export function diaAnclaCiclo(sub?: SubCiclo | null): number {
  return diaDe(sub?.currentPeriodEnd) ?? diaDe(sub?.trialEndsAt) ?? 1;
}

// Primer día (UTC) del ciclo que CONTIENE a `ahora`. El día se recorta a la longitud
// del mes: un ancla el 31 cae el 28/29 en febrero y el 30 en abril, sin saltarse ciclos.
export function inicioPeriodoCuota(ahora: Date, dia: number): Date {
  const anio = ahora.getUTCFullYear();
  const mes = ahora.getUTCMonth();
  const esteMes = Date.UTC(anio, mes, Math.min(dia, diasEnMes(anio, mes)));
  if (esteMes <= ahora.getTime()) return new Date(esteMes);
  // Aún no hemos llegado al ancla este mes → el ciclo vigente empezó el mes pasado.
  const anioAnt = mes === 0 ? anio - 1 : anio;
  const mesAnt = (mes + 11) % 12;
  return new Date(Date.UTC(anioAnt, mesAnt, Math.min(dia, diasEnMes(anioAnt, mesAnt))));
}

// Ciclo vigente: clave de UsoMensual + límites. `fin` es exclusivo (= inicio del siguiente).
export function periodoCuota(ahora: Date, sub?: SubCiclo | null): { clave: string; inicio: Date; fin: Date } {
  const dia = diaAnclaCiclo(sub);
  const inicio = inicioPeriodoCuota(ahora, dia);
  // El siguiente ciclo arranca un mes después del inicio (recortando el día otra vez).
  const anio = inicio.getUTCFullYear();
  const mes = inicio.getUTCMonth();
  const anioSig = mes === 11 ? anio + 1 : anio;
  const mesSig = (mes + 1) % 12;
  const fin = new Date(Date.UTC(anioSig, mesSig, Math.min(dia, diasEnMes(anioSig, mesSig))));
  return { clave: inicio.toISOString().slice(0, 10), inicio, fin };
}
