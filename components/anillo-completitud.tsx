"use client";

// Anillo de completitud del expediente (22/08/2026, pedido de Matthias): un círculo
// verde más o menos lleno con el % dentro. Sustituye a la barra de documentos en la
// tarjeta — la barra contaba SOLO documentos, y con dos indicadores de progreso en
// 3 cm² la tarjeta volvía a decir dos cosas parecidas. El detalle no se pierde: va en
// el tooltip (Información x/18, Documentos x/y, Formularios sí/no).
export function AnilloCompletitud({ pct, titulo, size = 34 }: { pct: number; titulo?: string; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  // Siempre verde aproba (pedido de Matthias): el % ya dice cuánto queda — colorearlo
  // de ámbar encima era decir lo mismo dos veces.
  const color = "text-aproba-500";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={titulo} aria-label={`${v}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} className="stroke-slate-100" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} strokeLinecap="round"
          className={`${color} transition-[stroke-dashoffset] duration-500`}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <span className="absolute text-[8px] font-bold tabular-nums text-slate-600">{v}%</span>
    </span>
  );
}
