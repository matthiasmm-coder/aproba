import type { CSSProperties, ReactNode } from "react";
import { AprobaMark } from "@/components/logo";

// MIGRACIÓN ANIMADA (portada). 30/09/2026 (Matthias): « le schéma doit être plus qualitatif et une
// animation montrant le flux de données se déplaçant ». 01/10/2026: « améliore autant que tu le
// peux cette animation, montre l'IA qui calcule » → la IA deja de ser un icono: es un PANEL que
// trabaja a la vista, con lo que el importador hace de verdad (components/importar-datos.tsx):
//   1. LEE las columnas: un haz recorre la cabecera de la hoja y el panel empareja cada columna
//      con su campo de Aproba («Caduca → Caducidad TIE», que alimenta al Vigía);
//   2. IMPORTA fila a fila: la fila sale de la hoja en bruto, entra en el panel (onda, las reglas
//      se aplican —destello— y el contador sube 1/3, 2/3, 3/3) y sale reconocida hacia Aproba,
//      donde su cliente se ilumina y recibe SU ✓ al llegar (Matthias, 30/09);
//   3. LISTO: «3 clientes dentro» y «3 renovaciones vigiladas»; la escena se recoge y vuelve a
//      empezar. Ciclo de 9 s.
// Coreografía en tiempo ABSOLUTO: cada elemento tiene sus propios @keyframes, generados aquí
// (una sola animación de 9 s por elemento, sin retrasos), todo en transform/opacity salvo el
// color de la cabecera. Sin animación («reducir movimiento»), cada elemento muestra su estado
// FINAL (columnas emparejadas, 3/3, los tres ✓): la imagen se entiende quieta.
// Datos ficticios, pasaportes enmascarados.

const FILAS = [
  { nombre: "Ioana Popescu", iniciales: "IP", pasaporte: "RO•••4829", caduca: "03/2027" },
  { nombre: "Karim Benali", iniciales: "KB", pasaporte: "MA•••9912", caduca: "11/2027" },
  { nombre: "Liu Wei", iniciales: "LW", pasaporte: "E••••8830", caduca: "06/2028" },
];
// Columna del archivo → campo del importador (sus nombres reales).
const COLS = [
  { hoja: "Nombre", campo: "Nombre completo" },
  { hoja: "Pasaporte", campo: "Pasaporte" },
  { hoja: "Caduca", campo: "Caducidad TIE" },
];

// ── Guion (segundos) ─────────────────────────────────────────────────────────────────────
const CICLO = 9;
const LEE = [0.55, 0.95, 1.35];                          // cada columna reconocida
const SALE = FILAS.map((_, i) => 1.95 + i * 1.1);        // la fila sale de la hoja
const VIAJE = 1.35;                                      // un tramo del hilo
const ENTRA = SALE.map((t) => t + VIAJE);                // entra en la IA
const PROCESA = 0.25;
const EMERGE = ENTRA.map((t) => t + PROCESA);            // sale reconocida
const LLEGA = EMERGE.map((t) => t + VIAJE);              // su cliente, en Aproba
const LISTO = LLEGA[LLEGA.length - 1] + 0.2;
const RECOGE = 8.6;                                      // todo se recoge para volver a empezar

// ── Keyframes en tiempo absoluto ─────────────────────────────────────────────────────────
type Paso = [number, string];
const pct = (t: number) => `${Math.min(100, Math.max(0, (t / CICLO) * 100)).toFixed(3)}%`;
const EASE = "animation-timing-function:cubic-bezier(.45,0,.25,1)";
const reglas: string[] = [];
function kf(nombre: string, pasos: Paso[]): CSSProperties {
  reglas.push(`@keyframes ${nombre}{${pasos.map(([t, css]) => `${pct(t)}{${css}}`).join("")}}`);
  return { animation: `${nombre} ${CICLO}s linear infinite` };
}
// Visible de t0 a t1 (entra y sale en ~0,2 s). `oculto`/`visible`: las declaraciones de cada estado.
const tramo = (t0: number, t1: number, oculto: string, visible: string): Paso[] =>
  [[0, oculto], [t0, oculto], [t0 + 0.2, visible], [t1, visible], [t1 + 0.22, oculto], [CICLO, oculto]];

const OCULTO = "opacity:0;transform:translateY(5px)";
const VISIBLE = "opacity:1;transform:translateY(0)";

// Hoja
const haz = kf("mig-haz", [[0, "opacity:0;transform:translateX(-120%)"], [0.15, `opacity:0;transform:translateX(-120%);${EASE}`], [0.3, "opacity:1"], [1.6, "opacity:1"], [1.75, "opacity:0;transform:translateX(430%)"], [CICLO, "opacity:0;transform:translateX(430%)"]]);
const colTexto = LEE.map((t, j) => kf(`mig-coltx-${j}`, tramo(t, RECOGE, "color:rgb(100 116 139)", "color:rgb(10 110 75)")));
const colCheck = LEE.map((t, j) => kf(`mig-colck-${j}`, tramo(t, RECOGE, "opacity:0;transform:scale(.4)", "opacity:1;transform:scale(1)")));
const filaSale = SALE.map((t, i) => kf(`mig-fsal-${i}`, [[0, "opacity:0"], [t - 0.15, "opacity:0"], [t + 0.05, "opacity:1"], [t + 0.8, "opacity:1"], [t + 1.1, "opacity:0"], [CICLO, "opacity:0"]]));

// Hilos: el portador cruza de −100 % a 0 (la pastilla va en su extremo)
const cruza = (eje: "X" | "Y", t0: number, t1: number, n: string) => kf(n, [
  [0, `opacity:0;transform:translate${eje}(-100%)`], [t0, `opacity:0;transform:translate${eje}(-100%);${EASE}`],
  [t0 + 0.12, "opacity:1"], [t1 - 0.14, "opacity:1"], [t1, `opacity:0;transform:translate${eje}(0)`], [CICLO, `opacity:0;transform:translate${eje}(0)`],
]);
const brutoX = SALE.map((t, i) => cruza("X", t, ENTRA[i], `mig-bx-${i}`));
const brutoY = SALE.map((t, i) => cruza("Y", t, ENTRA[i], `mig-by-${i}`));
const encoge = ENTRA.map((t, i) => kf(`mig-enc-${i}`, [[0, "transform:scale(1)"], [t - 0.35, "transform:scale(1)"], [t, "transform:scale(.55)"], [CICLO, "transform:scale(.55)"]]));
const listoX = EMERGE.map((t, i) => cruza("X", t, LLEGA[i], `mig-lx-${i}`));
const listoY = EMERGE.map((t, i) => cruza("Y", t, LLEGA[i], `mig-ly-${i}`));
const brota = EMERGE.map((t, i) => kf(`mig-bro-${i}`, [[0, "transform:scale(.6)"], [t, "transform:scale(.6)"], [t + 0.18, "transform:scale(1.08)"], [t + 0.3, "transform:scale(1)"], [CICLO, "transform:scale(1)"]]));

// Panel de la IA
const onda = ENTRA.map((t, i) => kf(`mig-onda-${i}`, [[0, "opacity:0;transform:scale(1)"], [t - 0.01, "opacity:0;transform:scale(1)"], [t, "opacity:.55;transform:scale(1)"], [t + 0.9, "opacity:0;transform:scale(1.9)"], [CICLO, "opacity:0;transform:scale(1.9)"]]));
const estado = [
  kf("mig-est-0", [[0, VISIBLE], [SALE[0] - 0.2, VISIBLE], [SALE[0] - 0.05, OCULTO], [RECOGE + 0.15, OCULTO], [RECOGE + 0.35, VISIBLE], [CICLO, VISIBLE]]),
  kf("mig-est-1", tramo(SALE[0] - 0.05, LLEGA[2], OCULTO, VISIBLE)),
  kf("mig-est-2", tramo(LISTO, RECOGE, OCULTO, VISIBLE)),
];
const mapa = LEE.map((t, j) => kf(`mig-map-${j}`, tramo(t, RECOGE, "opacity:0;transform:translateX(-6px)", "opacity:1;transform:translateX(0)")));
// Destello de las reglas sobre cada registro que entra: la IA las aplica fila a fila.
const destello = kf("mig-dest", [[0, "opacity:0"], ...ENTRA.flatMap((t): Paso[] => [[t, "opacity:0"], [t + 0.08, "opacity:1"], [t + 0.5, "opacity:0"]]), [CICLO, "opacity:0"]]);
const contador = [0, 1, 2, 3].map((n) => {
  if (n === 0) return kf("mig-cnt-0", [[0, VISIBLE], [ENTRA[0], VISIBLE], [ENTRA[0] + 0.12, OCULTO], [RECOGE + 0.15, OCULTO], [RECOGE + 0.35, VISIBLE], [CICLO, VISIBLE]]);
  const hasta = n === 3 ? RECOGE : ENTRA[n];
  return kf(`mig-cnt-${n}`, tramo(ENTRA[n - 1], hasta, OCULTO, VISIBLE));
});
const barra = kf("mig-barra", [
  [0, "transform:scaleX(0)"],
  ...ENTRA.flatMap((t, i): Paso[] => [[t, `transform:scaleX(${(i / 3).toFixed(4)})`], [t + 0.3, `transform:scaleX(${((i + 1) / 3).toFixed(4)})`]]),
  [RECOGE, "transform:scaleX(1)"], [RECOGE + 0.3, "transform:scaleX(0)"], [CICLO, "transform:scaleX(0)"],
]);

// Aproba
const filaLlega = LLEGA.map((t, i) => kf(`mig-fll-${i}`, [[0, "opacity:0"], [t - 0.05, "opacity:0"], [t + 0.1, "opacity:1"], [t + 0.9, "opacity:1"], [t + 1.3, "opacity:0"], [CICLO, "opacity:0"]]));
const sello = LLEGA.map((t, i) => kf(`mig-sel-${i}`, [[0, "opacity:0;transform:scale(.4)"], [t, "opacity:0;transform:scale(.4)"], [t + 0.18, "opacity:1;transform:scale(1.15)"], [t + 0.3, "opacity:1;transform:scale(1)"], [RECOGE, "opacity:1;transform:scale(1)"], [RECOGE + 0.25, "opacity:0;transform:scale(.6)"], [CICLO, "opacity:0;transform:scale(.6)"]]));
const vigia = kf("mig-vigia", tramo(LISTO + 0.1, RECOGE, OCULTO, VISIBLE));

const CSS = `${reglas.join("")}
.mig-puntos span{animation:mig-punto 1.1s ease-in-out infinite}
.mig-puntos span:nth-child(2){animation-delay:.15s}.mig-puntos span:nth-child(3){animation-delay:.3s}
@keyframes mig-punto{0%,70%,100%{opacity:.25;transform:translateY(0)}35%{opacity:1;transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){.mig-a,.mig-puntos span{animation:none!important}}`;

// ── Piezas ───────────────────────────────────────────────────────────────────────────────
const COLUMNAS = "lg:grid-cols-[minmax(250px,1.35fr)_minmax(56px,0.55fr)_256px_minmax(56px,0.55fr)_minmax(250px,1.35fr)]";
const CELDAS = "grid grid-cols-[14px_1.5fr_1fr_0.8fr] gap-x-3 border-b border-slate-100 px-3 py-2";

function Check({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
}

function Cabecera({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">{children}</div>;
}

// La hoja del despacho, tal cual: numeración de filas, cabecera en la fila 1, una fila vacía.
function Hoja() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-float ring-1 ring-slate-900/[0.06] lg:self-stretch">
      <Cabecera>
        <span aria-hidden="true" className="grid h-5 w-5 grid-cols-2 gap-[2px] rounded-[5px] bg-emerald-600 p-[3px]">
          <span className="rounded-[1px] bg-white/90" /><span className="rounded-[1px] bg-white/60" />
          <span className="rounded-[1px] bg-white/60" /><span className="rounded-[1px] bg-white/90" />
        </span>
        <span className="font-mono text-xs text-slate-600">clientes.xlsx</span>
      </Cabecera>
      <div className="text-xs">
        {/* Cabecera: el haz de la IA la recorre y cada columna reconocida se tiñe y lleva su ✓. */}
        <div className={`relative overflow-hidden ${CELDAS} font-semibold`}>
          <span aria-hidden="true" style={haz} className="mig-a pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-aproba-300/45 to-transparent opacity-0" />
          <span className="text-right text-[10px] font-normal text-slate-300">1</span>
          {COLS.map((c, j) => (
            <span key={c.hoja} style={colTexto[j]} className="mig-a relative inline-flex items-center gap-1 text-aproba-700">
              {c.hoja}
              <span style={colCheck[j]} className="mig-a flex h-3.5 w-3.5 items-center justify-center rounded-full bg-aproba-600 text-white"><Check className="h-2 w-2" /></span>
            </span>
          ))}
        </div>
        {FILAS.map((f, i) => (
          <div key={f.nombre} className={`relative ${CELDAS} text-slate-700`}>
            <span aria-hidden="true" style={filaSale[i]} className="mig-a pointer-events-none absolute inset-0 bg-aproba-500/[0.13] opacity-0" />
            <span className="relative text-right text-[10px] text-slate-300">{i + 2}</span>
            <span className="relative truncate">{f.nombre}</span>
            <span className="relative truncate text-slate-500">{f.pasaporte}</span>
            <span className="relative tabular-nums">{f.caduca}</span>
          </div>
        ))}
        <div className={`${CELDAS} border-b-0`}>
          <span className="text-right text-[10px] text-slate-300">5</span><span>&nbsp;</span>
        </div>
      </div>
    </div>
  );
}

// La IA, trabajando a la vista: estado, columnas emparejadas, contador y barra.
function PanelIA() {
  return (
    <div className="relative mx-auto w-full max-w-[256px] rounded-2xl bg-white p-4 shadow-float ring-1 ring-aproba-200/80">
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          {onda.map((s, i) => <span key={i} aria-hidden="true" style={s} className="mig-a absolute inset-0 rounded-full bg-aproba-400/40 opacity-0 motion-reduce:hidden" />)}
          <span aria-hidden="true" className="absolute -inset-1.5 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(52,211,153,0.95)_70deg,transparent_150deg)] animate-[spin_2.4s_linear_infinite] motion-reduce:hidden" />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-aproba-500 to-aproba-700 text-white ring-[3px] ring-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z" /></svg>
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-tight text-slate-900">IA de Aproba</p>
          <p className="relative mt-0.5 h-4 text-[11px] font-medium text-aproba-700">
            <span style={estado[0]} className="mig-a absolute inset-0 flex items-center gap-1 whitespace-nowrap opacity-0">Leyendo columnas<Puntos /></span>
            <span style={estado[1]} className="mig-a absolute inset-0 flex items-center gap-1 whitespace-nowrap opacity-0">Importando clientes<Puntos /></span>
            <span style={estado[2]} className="mig-a absolute inset-0 flex items-center gap-1 whitespace-nowrap"><Check className="h-3 w-3" />Listo</span>
          </p>
        </div>
      </div>

      <ul className="relative mt-3.5 space-y-1 border-t border-slate-100 pt-3">
        {COLS.map((c, j) => (
          <li key={c.hoja} style={mapa[j]} className="mig-a relative flex items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-1 text-[11px]">
            <span aria-hidden="true" style={destello} className="mig-a pointer-events-none absolute inset-0 bg-aproba-400/20 opacity-0" />
            <span className="relative w-[3.9rem] shrink-0 truncate font-mono text-slate-500">{c.hoja}</span>
            <svg className="relative h-3 w-3 shrink-0 text-aproba-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <span className="relative min-w-0 flex-1 truncate font-semibold text-slate-800">{c.campo}</span>
            <Check className="relative h-3 w-3 shrink-0 text-aproba-600" />
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="font-medium text-slate-500">Clientes</span>
          <span className="relative h-4 w-8 text-right font-semibold tabular-nums text-slate-900">
            {[0, 1, 2, 3].map((n) => (
              <span key={n} style={contador[n]} className={`mig-a absolute inset-0 ${n === 3 ? "" : "opacity-0"}`}>{n}/3</span>
            ))}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <span style={barra} className="mig-a block h-full origin-left rounded-full bg-gradient-to-r from-aproba-400 to-aproba-600" />
        </div>
      </div>
    </div>
  );
}

function Puntos() {
  return (
    <span aria-hidden="true" className="mig-puntos inline-flex items-center gap-[2px] pl-0.5">
      <span className="h-[3px] w-[3px] rounded-full bg-aproba-600" /><span className="h-[3px] w-[3px] rounded-full bg-aproba-600" /><span className="h-[3px] w-[3px] rounded-full bg-aproba-600" />
    </span>
  );
}

function Resultado() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-float ring-1 ring-slate-900/[0.06] lg:self-stretch">
      <Cabecera>
        <AprobaMark size={20} />
        <span className="text-xs font-semibold text-slate-700">Clientes</span>
      </Cabecera>
      <ul className="divide-y divide-slate-100">
        {FILAS.map((f, i) => (
          <li key={f.nombre} className="relative flex items-center gap-3 px-4 py-2.5">
            <span aria-hidden="true" style={filaLlega[i]} className="mig-a pointer-events-none absolute inset-0 bg-aproba-500/[0.13] opacity-0" />
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aproba-50 text-[10px] font-bold text-aproba-700 ring-1 ring-aproba-100">{f.iniciales}</span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-slate-900">{f.nombre}</span>
              <span className="block truncate text-[11px] text-slate-500">Ficha · renovación {f.caduca}</span>
            </span>
            <span style={sello[i]} className="mig-a relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aproba-600 text-white">
              <Check className="h-3 w-3" />
            </span>
          </li>
        ))}
      </ul>
      {/* Las caducidades del archivo pasan al Vigía: renovaciones vigiladas. */}
      <div style={vigia} className="mig-a border-t border-slate-100 bg-aproba-50/60 px-4 py-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-aproba-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
          3 renovaciones vigiladas
        </p>
      </div>
    </div>
  );
}

// El hilo entre dos piezas: rayas que fluyen sin parar y, por fila, un portador que cruza de
// −100 % a 0 con su pastilla en el extremo. Tramo 1 = el dato en bruto (blanca, se encoge al
// entrar en la IA); tramo 2 = reconocido (verde, con ✓, brota de ella). Horizontal en
// escritorio, vertical en móvil.
function Hilo({ tramo: n }: { tramo: 1 | 2 }) {
  const bruto = n === 1;
  const pastilla = `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
    bruto ? "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200" : "bg-aproba-600 text-white shadow-[0_0_16px_rgba(16,176,131,0.6)]"
  }`;
  const color = bruto ? "to-slate-300" : "to-aproba-400";
  const escala = bruto ? encoge : brota;
  const contenido = (f: (typeof FILAS)[number]) => <>{!bruto && <Check className="h-3 w-3" />}{f.nombre}</>;
  return (
    <>
      <div aria-hidden="true" className="relative hidden h-14 overflow-hidden lg:block">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <span className="absolute inset-0 bg-slate-200" />
          <span className="absolute inset-y-0 -left-[14px] right-0 bg-[repeating-linear-gradient(90deg,rgba(16,176,131,0.55)_0_6px,transparent_6px_14px)] animate-flujo-x motion-reduce:animate-none" />
        </span>
        {FILAS.map((f, i) => (
          <span key={f.nombre} style={(bruto ? brutoX : listoX)[i]} className="mig-a absolute inset-0 opacity-0">
            <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
              <span className={`h-[2px] w-12 rounded-full bg-gradient-to-r from-transparent ${color}`} />
              <span style={escala[i]} className={`mig-a ${pastilla} ${bruto ? "origin-right" : "origin-left"}`}>{contenido(f)}</span>
            </span>
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="relative mx-auto h-20 w-52 overflow-hidden lg:hidden">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(180deg,transparent,black_12%,black_88%,transparent)]">
          <span className="absolute inset-0 bg-slate-200" />
          <span className="absolute inset-x-0 -top-[14px] bottom-0 bg-[repeating-linear-gradient(180deg,rgba(16,176,131,0.55)_0_6px,transparent_6px_14px)] animate-flujo-y motion-reduce:animate-none" />
        </span>
        {FILAS.map((f, i) => (
          <span key={f.nombre} style={(bruto ? brutoY : listoY)[i]} className="mig-a absolute inset-0 opacity-0">
            <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 flex-col items-center">
              <span className={`h-10 w-[2px] rounded-full bg-gradient-to-b from-transparent ${color}`} />
              <span style={escala[i]} className={`mig-a ${pastilla} ${bruto ? "origin-bottom" : "origin-top"}`}>{contenido(f)}</span>
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

const PIES = [
  { n: "01", t: "Tu archivo, tal cual", d: "Excel, CSV o la exportación de tu programa." },
  { n: "02", t: "La IA lo entiende", d: "Reconoce tus columnas y tú confirmas." },
  { n: "03", t: "Todo dentro", d: "Clientes, historial y caducidades vigiladas." },
];

export function MigracionAnimada() {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-slate-50 to-white px-5 py-10 ring-1 ring-slate-900/[0.05] sm:px-8 lg:px-10 lg:py-12">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* Trama de puntos, difuminada hacia los bordes */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.08)_1px,transparent_0)] [background-size:20px_20px] [mask-image:radial-gradient(60%_70%_at_50%_40%,black,transparent)]" />
      <div role="img" aria-label="Tu archivo de clientes pasa por la IA de Aproba, que reconoce cada columna y la empareja con su campo; cada cliente queda dentro con su ficha y su renovación vigilada." className={`relative mx-auto grid max-w-sm grid-cols-1 lg:max-w-none lg:items-center ${COLUMNAS}`}>
        <Hoja />
        <Hilo tramo={1} />
        <PanelIA />
        <Hilo tramo={2} />
        <Resultado />
      </div>
      <ol className={`relative mx-auto mt-10 grid max-w-sm grid-cols-1 gap-7 lg:max-w-none lg:gap-0 ${COLUMNAS}`}>
        {PIES.map((p, i) => (
          <li key={p.n} className={`text-center ${i === 1 ? "lg:col-span-3" : ""}`}>
            <p className="font-mono text-[11px] font-semibold tracking-widest text-aproba-600">{p.n}</p>
            <p className="mt-1.5 font-semibold text-slate-900">{p.t}</p>
            <p className="mx-auto mt-1 max-w-[16rem] text-sm leading-relaxed text-slate-500">{p.d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
