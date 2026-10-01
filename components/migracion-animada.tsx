import type { CSSProperties, ReactNode } from "react";
import { AprobaMark } from "@/components/logo";

// MIGRACIÓN ANIMADA (portada). 30/09/2026 (Matthias): « une animation montrant le flux de données ».
// 01/10/2026: « montre l'IA qui calcule », y después « la compréhension doit être plus immédiate
// (il y a bcp de choses) ; trouve un meilleur symbole pour l'IA » → UNA historia, un objeto a la vez:
//   el cliente sale de la hoja → entra en el chip «IA», que se enciende y reconoce sus tres datos
//   (Nombre · Pasaporte · Caducidad se iluminan uno tras otro: los campos reales del importador,
//   components/importar-datos.tsx) → sale reconocido (verde, ✓) → aparece en la lista de Aproba.
// Tres clientes seguidos, nunca dos en movimiento a la vez; la lista de Aproba se llena sola y, al
// final, se vacía para volver a empezar. Ciclo de 10 s. El símbolo de la IA es un CHIP con «IA»:
// se lee sin explicación (el destello ✦ se confundía con un adorno).
// 01/10/2026 (bis): « l'icône IA doit être mieux animée, presque vivante », y la hoja sin su fila
// vacía (tarjetas más bajas) → el chip respira (sube y su halo se aviva), su luz interior gira
// despacio y su «IA» parpadea en reposo; mira al cliente que llega, se lo traga, lo «mastica»
// mientras la corriente lo atraviesa de las patas de entrada a las de salida, y lo suelta girado
// hacia Aproba, con un destello.
// Coreografía en tiempo ABSOLUTO: cada elemento lleva sus @keyframes, generados aquí, todo en
// transform/opacity. Sin animación («reducir movimiento»), cada elemento muestra su estado FINAL
// (los tres clientes dentro con su ✓, el chip quieto): la imagen se entiende quieta.
// Datos ficticios, pasaportes enmascarados.

const FILAS = [
  { nombre: "Ioana Popescu", iniciales: "IP", pasaporte: "RO•••4829", caduca: "03/2027" },
  { nombre: "Karim Benali", iniciales: "KB", pasaporte: "MA•••9912", caduca: "11/2027" },
  { nombre: "Liu Wei", iniciales: "LW", pasaporte: "E••••8830", caduca: "06/2028" },
];
const CAMPOS = ["Nombre", "Pasaporte", "Caducidad"];

// ── Guion (segundos) ─────────────────────────────────────────────────────────────────────
const CICLO = 10;
const VIAJE = 0.95;                                       // un tramo del hilo
const PROCESA = 0.6;                                      // el chip reconoce los tres datos
const SALE = FILAS.map((_, i) => 0.45 + i * (2 * VIAJE + PROCESA)); // uno tras otro
const ENTRA = SALE.map((t) => t + VIAJE);
const EMERGE = ENTRA.map((t) => t + PROCESA);
const LLEGA = EMERGE.map((t) => t + VIAJE);
const RECOGE = 9.35;                                      // la lista se vacía para volver a empezar
const RESPIRA = (CICLO / 3).toFixed(3);                   // tres respiraciones del chip por ciclo

// ── Keyframes en tiempo absoluto ─────────────────────────────────────────────────────────
type Paso = [number, string];
const pct = (t: number) => `${Math.min(100, Math.max(0, (t / CICLO) * 100)).toFixed(3)}%`;
const CURVA = "cubic-bezier(.45,0,.25,1)";
const EASE = `animation-timing-function:${CURVA}`;
const reglas: string[] = [];
function keyframes(nombre: string, pasos: Paso[]) {
  reglas.push(`@keyframes ${nombre}{${pasos.map(([t, css]) => `${pct(t)}{${css}}`).join("")}}`);
}
function kf(nombre: string, pasos: Paso[]): CSSProperties {
  keyframes(nombre, pasos);
  return { animation: `${nombre} ${CICLO}s linear infinite` };
}
// Destellos cortos en los instantes dados (subir en `sube` s, bajar en `baja` s).
const destellos = (nombre: string, instantes: number[], apagado: string, encendido: string, sube = 0.08, baja = 0.45) =>
  kf(nombre, [[0, apagado], ...instantes.flatMap((t): Paso[] => [[t, apagado], [t + sube, encendido], [t + sube + baja, apagado]]), [CICLO, apagado]]);

// Hoja: la fila que sale se ilumina.
const filaSale = SALE.map((t, i) => kf(`mig-fs-${i}`, [[0, "opacity:0"], [t - 0.2, "opacity:0"], [t, "opacity:1"], [t + 0.7, "opacity:1"], [t + 1.0, "opacity:0"], [CICLO, "opacity:0"]]));

// Hilos: el portador cruza de −100 % a 0 con la pastilla en su extremo.
const cruza = (eje: "X" | "Y", t0: number, t1: number, n: string) => kf(n, [
  [0, `opacity:0;transform:translate${eje}(-100%)`], [t0, `opacity:0;transform:translate${eje}(-100%);${EASE}`],
  [t0 + 0.1, "opacity:1"], [t1 - 0.12, "opacity:1"], [t1, `opacity:0;transform:translate${eje}(0)`], [CICLO, `opacity:0;transform:translate${eje}(0)`],
]);
const brutoX = SALE.map((t, i) => cruza("X", t, ENTRA[i], `mig-bx-${i}`));
const brutoY = SALE.map((t, i) => cruza("Y", t, ENTRA[i], `mig-by-${i}`));
const listoX = EMERGE.map((t, i) => cruza("X", t, LLEGA[i], `mig-lx-${i}`));
const listoY = EMERGE.map((t, i) => cruza("Y", t, LLEGA[i], `mig-ly-${i}`));
const encoge = ENTRA.map((t, i) => kf(`mig-en-${i}`, [[0, "transform:scale(1)"], [t - 0.3, "transform:scale(1)"], [t, "transform:scale(.55)"], [CICLO, "transform:scale(.55)"]]));
const brota = EMERGE.map((t, i) => kf(`mig-br-${i}`, [[0, "transform:scale(.6)"], [t, "transform:scale(.6)"], [t + 0.16, "transform:scale(1.08)"], [t + 0.28, "transform:scale(1)"], [CICLO, "transform:scale(1)"]]));

// Chip: una onda al entrar cada cliente, el chip se aviva mientras trabaja (halo y remolino de luz)
// y cada dato se ilumina en su turno.
const onda = ENTRA.map((t, i) => kf(`mig-on-${i}`, [[0, "opacity:0;transform:scale(1)"], [t - 0.01, "opacity:0;transform:scale(1)"], [t, "opacity:.5;transform:scale(1)"], [t + 0.85, "opacity:0;transform:scale(1.7)"], [CICLO, "opacity:0;transform:scale(1.7)"]]));
const trabaja = destellos("mig-trab", ENTRA, "opacity:0", "opacity:1", 0.1, PROCESA);
const turno = (j: number) => ENTRA.map((t) => t + 0.05 + j * 0.16);
const campoFondo = CAMPOS.map((_, j) => destellos(`mig-cf-${j}`, turno(j), "opacity:0", "opacity:1", 0.08, 0.5));
const campoTexto = CAMPOS.map((_, j) => destellos(`mig-ct-${j}`, turno(j), "color:rgb(100 116 139)", "color:rgb(255 255 255)", 0.08, 0.5));

// Las patas del chip, por orden de paso de la corriente: entra por la izquierda (el lado del
// archivo), recorre arriba y abajo y sale por la derecha (el de Aproba) justo cuando brota el
// cliente reconocido. En móvil esa capa gira 90° y la corriente baja de arriba abajo, como el hilo.
type Pata = [number, number, number, number];
const PATAS = [30, 44, 58];
const ETAPAS: Pata[][] = [
  PATAS.map((p): Pata => [4, p, 14, p]),
  ...PATAS.map((p): Pata[] => [[p, 4, p, 14], [p, 74, p, 84]]),
  PATAS.map((p): Pata => [74, p, 84, p]),
];
const corriente = ETAPAS.map((_, s) => destellos(`mig-co-${s}`, ENTRA.map((t) => t + 0.1 + s * 0.1), "opacity:0", "opacity:1", 0.05, 0.3));

// El cuerpo del chip, como un personaje: gira hacia el cliente que llega, lo espera, se lo traga
// (aplastado a lo largo del hilo), lo mastica, coge impulso y lo suelta girado hacia Aproba; lo
// sigue con la mirada y vuelve al centro. Giro en Y en escritorio; en X en móvil, donde el hilo
// baja (`.mig-cu`, abajo). La MISMA lista de funciones en cada paso, para que se interpole bien.
function postura(eje: "x" | "y", giro: number, d: number, largo = 1, ancho = 1) {
  return eje === "x"
    ? `transform:perspective(320px) rotateY(${giro}deg) translateX(${d}px) scale(${largo},${ancho})`
    : `transform:perspective(320px) rotateX(${-giro}deg) translateY(${d}px) scale(${ancho},${largo})`;
}
for (const eje of ["x", "y"] as const) {
  const p = (giro: number, d: number, largo?: number, ancho?: number) => postura(eje, giro, d, largo, ancho);
  keyframes(`mig-cu-${eje}`, [
    [0, p(0, 0)],
    ...SALE.flatMap((t, i): Paso[] => [
      [t + 0.2, p(0, 0)],
      [t + 0.6, p(-18, -2)],
      [ENTRA[i] - 0.1, p(-18, -2, 1.04, 1.04)],
      [ENTRA[i] + 0.06, p(0, 0, 0.9, 1.08)],
      [ENTRA[i] + 0.18, p(0, 0, 1.06, 0.95)],
      [ENTRA[i] + 0.3, p(0, 0, 0.97, 1.03)],
      [ENTRA[i] + 0.42, p(0, 0, 1.03, 0.98)],
      [EMERGE[i] - 0.06, p(0, 0, 0.95, 1.03)],
      [EMERGE[i] + 0.1, p(16, 3, 1.08, 0.95)],
      [EMERGE[i] + 0.4, p(18, 2)],
      [EMERGE[i] + 0.85, p(0, 0)],
    ]),
    [CICLO, p(0, 0)],
  ]);
}

// Parpadeo del «IA», como unos ojos, en los ratos de reposo: al despertar, antes del primer
// cliente, y uno doble cuando ha terminado con los tres.
const parpadeo = kf("mig-pa", [
  [0, "transform:scaleY(1)"],
  ...[0.12, 8.45, 8.68].flatMap((t): Paso[] => [[t, "transform:scaleY(1)"], [t + 0.07, "transform:scaleY(.12)"], [t + 0.15, "transform:scaleY(1)"]]),
  [CICLO, "transform:scaleY(1)"],
]);

// Destello que barre el chip cuando suelta al cliente reconocido.
const barre = (x: number) => `transform:translateX(${x}%) skewX(-20deg)`;
const brillo = kf("mig-bri", [
  [0, `opacity:0;${barre(-180)}`],
  ...EMERGE.flatMap((t): Paso[] => [[t - 0.08, `opacity:0;${barre(-180)}`], [t - 0.06, `opacity:1;${barre(-180)};${EASE}`], [t + 0.42, `opacity:1;${barre(240)}`], [t + 0.44, `opacity:0;${barre(240)}`]]),
  [CICLO, `opacity:0;${barre(240)}`],
]);

// Aproba: el cliente aparece al llegar (y se ilumina), con su ✓; todo se vacía al final.
const aparece = LLEGA.map((t, i) => kf(`mig-ap-${i}`, [[0, "opacity:0;transform:translateY(6px)"], [t - 0.05, "opacity:0;transform:translateY(6px)"], [t + 0.25, "opacity:1;transform:translateY(0)"], [RECOGE, "opacity:1;transform:translateY(0)"], [RECOGE + 0.35, "opacity:0;transform:translateY(0)"], [CICLO, "opacity:0;transform:translateY(6px)"]]));
const resalta = LLEGA.map((t, i) => kf(`mig-rs-${i}`, [[0, "opacity:0"], [t, "opacity:0"], [t + 0.15, "opacity:1"], [t + 0.9, "opacity:1"], [t + 1.3, "opacity:0"], [CICLO, "opacity:0"]]));
const sello = LLEGA.map((t, i) => kf(`mig-sl-${i}`, [[0, "opacity:0;transform:scale(.4)"], [t + 0.1, "opacity:0;transform:scale(.4)"], [t + 0.28, "opacity:1;transform:scale(1.15)"], [t + 0.4, "opacity:1;transform:scale(1)"], [CICLO, "opacity:1;transform:scale(1)"]]));

// Lo que no depende del guion: la respiración (sube un poco y se hincha; el halo se aviva al
// inspirar) y la luz interior, que gira despacio en reposo y deprisa mientras trabaja.
const CSS = [
  ...reglas,
  "@keyframes mig-respira{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.035)}}",
  "@keyframes mig-halo{0%,100%{opacity:.45;transform:scale(.9)}50%{opacity:1;transform:scale(1.1)}}",
  "@keyframes mig-gira{to{transform:rotate(1turn)}}",
  `.mig-vive{animation:mig-respira ${RESPIRA}s ease-in-out infinite}`,
  `.mig-halo{animation:mig-halo ${RESPIRA}s ease-in-out infinite}`,
  ".mig-aurora{background:conic-gradient(from 0deg,transparent 0deg,rgba(255,255,255,.2) 55deg,transparent 115deg,transparent 180deg,rgba(167,243,208,.3) 235deg,transparent 295deg);animation:mig-gira 9s linear infinite}",
  ".mig-remolino{background:conic-gradient(from 0deg,transparent 0deg,rgba(255,255,255,.45) 40deg,transparent 95deg,transparent 180deg,rgba(255,255,255,.3) 220deg,transparent 275deg);animation:mig-gira .8s linear infinite}",
  `.mig-cu{animation:mig-cu-y ${CICLO}s ${CURVA} infinite}@media (min-width:1024px){.mig-cu{animation-name:mig-cu-x}}`,
  "@media (prefers-reduced-motion:reduce){.mig-a{animation:none!important}}",
].join("");

// ── Piezas ───────────────────────────────────────────────────────────────────────────────
const COLUMNAS = "lg:grid-cols-[minmax(250px,1.35fr)_minmax(64px,0.6fr)_148px_minmax(64px,0.6fr)_minmax(250px,1.35fr)]";
const CELDAS = "grid grid-cols-[14px_1.5fr_1fr_0.8fr] gap-x-3 border-b border-slate-100 px-3 py-2";

function Check({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
}

function Cabecera({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">{children}</div>;
}

// La hoja del despacho, tal cual: numeración de filas y la cabecera en la fila 1. Es la que marca
// la altura de las dos tarjetas (la de Aproba reparte sus filas en ella).
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
        <div className={`${CELDAS} font-semibold text-slate-500`}>
          <span className="text-right text-[10px] font-normal text-slate-300">1</span><span>Nombre</span><span>Pasaporte</span><span>Caduca</span>
        </div>
        {FILAS.map((f, i) => (
          <div key={f.nombre} className={`relative ${CELDAS} text-slate-700 last:border-b-0`}>
            <span aria-hidden="true" style={filaSale[i]} className="mig-a pointer-events-none absolute inset-0 bg-aproba-500/[0.13] opacity-0" />
            <span className="relative text-right text-[10px] text-slate-300">{i + 2}</span>
            <span className="relative truncate">{f.nombre}</span>
            <span className="relative truncate text-slate-500">{f.pasaporte}</span>
            <span className="relative tabular-nums">{f.caduca}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// El símbolo de la IA: un chip con «IA», vivo. Capas, de fuera adentro: el halo que respira (y
// se aviva mientras trabaja), la onda de cada cliente que entra y el chip, que respira (`.mig-vive`)
// y reacciona al guion (`.mig-cu`); dentro, las patas grises, la corriente verde que las recorre y
// la cara con su luz interior, el remolino de cuando trabaja, el destello al soltar y el «IA» que
// parpadea. Debajo, los tres datos que reconoce, cada uno en su turno.
function ChipIA() {
  const linea = ([x1, y1, x2, y2]: Pata, k: string) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />;
  return (
    <div className="relative mx-auto flex flex-col items-center lg:block">
      <div className="relative mx-auto h-[88px] w-[88px]">
        <span aria-hidden="true" className="mig-a mig-halo absolute -inset-5 rounded-full bg-[radial-gradient(closest-side,rgba(16,176,131,0.22),transparent)]" />
        <span aria-hidden="true" style={trabaja} className="mig-a absolute -inset-5 rounded-full bg-[radial-gradient(closest-side,rgba(16,176,131,0.4),transparent)] opacity-0" />
        {onda.map((s, i) => <span key={i} aria-hidden="true" style={s} className="mig-a absolute inset-[14px] rounded-2xl bg-aproba-400/45 opacity-0" />)}
        <div className="mig-a mig-vive absolute inset-0">
          <div className="mig-a mig-cu absolute inset-0">
            <svg viewBox="0 0 88 88" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <g stroke="rgb(203 213 225)" strokeWidth="3" strokeLinecap="round">{ETAPAS.flat().map((l, k) => linea(l, `p${k}`))}</g>
            </svg>
            <svg viewBox="0 0 88 88" className="absolute inset-0 h-full w-full rotate-90 lg:rotate-0" aria-hidden="true">
              {ETAPAS.map((etapa, s) => (
                <g key={s} style={corriente[s]} className="mig-a opacity-0" stroke="rgb(16 176 131)" strokeWidth="3" strokeLinecap="round">
                  {etapa.map((l, k) => linea(l, `c${s}-${k}`))}
                </g>
              ))}
            </svg>
            <div className="absolute inset-[14px] flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-aproba-500 to-aproba-700 shadow-float ring-4 ring-white">
              <span aria-hidden="true" className="mig-a mig-aurora absolute -inset-1/2" />
              <span aria-hidden="true" style={trabaja} className="mig-a absolute inset-0 opacity-0">
                <span className="mig-a mig-remolino absolute -inset-1/2" />
              </span>
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
              <span aria-hidden="true" style={brillo} className="mig-a absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0" />
              <span style={parpadeo} className="mig-a relative text-[22px] font-bold tracking-tight text-white">IA</span>
            </div>
          </div>
        </div>
      </div>
      {/* Los datos que la IA reconoce en cada cliente. En escritorio cuelgan bajo el chip sin
          descentrarlo del hilo. */}
      <ul className="mt-3 flex items-center justify-center gap-1 whitespace-nowrap lg:absolute lg:left-1/2 lg:top-full lg:mt-3 lg:-translate-x-1/2">
        {CAMPOS.map((c, j) => (
          <li key={c} className="relative rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200">
            {/* Se rellena de verde en su turno: el MISMO texto, sin capa encima que lo desdoble. */}
            <span aria-hidden="true" style={campoFondo[j]} className="mig-a absolute inset-0 rounded-full bg-aproba-600 opacity-0" />
            <span style={campoTexto[j]} className="mig-a relative text-slate-500">{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// La lista de Aproba: sus tres filas se reparten la altura que marca la hoja.
function Resultado() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-float ring-1 ring-slate-900/[0.06] lg:self-stretch">
      <Cabecera>
        <AprobaMark size={20} />
        <span className="text-xs font-semibold text-slate-700">Clientes</span>
      </Cabecera>
      <ul className="flex flex-1 flex-col">
        {FILAS.map((f, i) => (
          <li key={f.nombre} style={aparece[i]} className="mig-a relative flex flex-1 items-center gap-3 border-b border-slate-100 px-4 py-1.5 last:border-b-0">
            <span aria-hidden="true" style={resalta[i]} className="mig-a pointer-events-none absolute inset-0 bg-aproba-500/[0.13] opacity-0" />
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aproba-50 text-[10px] font-bold text-aproba-700 ring-1 ring-aproba-100">{f.iniciales}</span>
            <span className="relative min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-slate-900">{f.nombre}</span>
              <span className="block truncate text-[11px] text-slate-500">Ficha · renovación {f.caduca}</span>
            </span>
            <span style={sello[i]} className="mig-a relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aproba-600 text-white">
              <Check className="h-3 w-3" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// El hilo entre dos piezas: rayas que fluyen sin parar y, por cliente, un portador que cruza de
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
      <div role="img" aria-label="Tu archivo de clientes pasa por la IA de Aproba, que reconoce el nombre, el pasaporte y la caducidad de cada cliente; cada uno queda dentro con su ficha y su renovación vigilada." className={`relative mx-auto grid max-w-sm grid-cols-1 lg:max-w-none lg:items-center ${COLUMNAS}`}>
        <Hoja />
        <Hilo tramo={1} />
        <ChipIA />
        <Hilo tramo={2} />
        <Resultado />
      </div>
      <ol className={`relative mx-auto mt-10 grid max-w-sm grid-cols-1 gap-7 lg:mt-14 lg:max-w-none lg:gap-0 ${COLUMNAS}`}>
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
