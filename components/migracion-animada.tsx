import type { CSSProperties, ReactNode } from "react";
import { AprobaMark } from "@/components/logo";

// MIGRACIÓN ANIMADA (portada; Matthias, 30/09/2026 : « le schéma doit être plus qualitatif et
// une animation montrant le flux de données se déplaçant »). Solo CSS, ciclo de 6 s (keyframes
// viajeX/viajeY, resalte, sello y latido en tailwind.config.ts), todo en transform/opacity salvo
// el resalte de las filas.
// Guion de la fila i (desfase i × 1,1 s): se ilumina en la hoja y sale su paquete en bruto
// (gris) → a los 1,5 s entra en la IA, que late → sale reconocido (verde, con ✓) → a los 3 s su
// cliente se ilumina en Aproba y SU ✓ aparece (Matthias, 30/09: « la coche doit apparaître lorsque
// les données du client arrivent »); se va cuando su paquete siguiente sale de la IA. Las filas
// se ven siempre: con «reducir movimiento» nada se mueve y los tres ✓ quedan puestos.
// Datos ficticios, pasaportes enmascarados.

const FILAS = [
  { nombre: "Ioana Popescu", corto: "Ioana", iniciales: "IP", pasaporte: "RO•••4829", caduca: "03/2027" },
  { nombre: "Karim Benali", corto: "Karim", iniciales: "KB", pasaporte: "MA•••9912", caduca: "11/2027" },
  { nombre: "Liu Wei", corto: "Liu", iniciales: "LW", pasaporte: "E••••8830", caduca: "06/2028" },
];
const DESFASE = 1.1; // s entre filas
const TRAMO = 1.5; // s por tramo = 25 % del ciclo (viajeX/viajeY)

const en = (s: number): CSSProperties => ({ animationDelay: `${s.toFixed(2)}s` });

// Las mismas columnas para la maqueta y para los pies: cada pie cae bajo su pieza.
const COLUMNAS = "lg:grid-cols-[minmax(270px,1.5fr)_minmax(88px,1fr)_72px_minmax(88px,1fr)_minmax(270px,1.5fr)]";
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
        <div className={`${CELDAS} font-semibold text-slate-500`}>
          <span className="text-right text-[10px] font-normal text-slate-300">1</span><span>Nombre</span><span>Pasaporte</span><span>Caduca</span>
        </div>
        {FILAS.map((f, i) => (
          <div key={f.nombre} style={en(i * DESFASE - 0.3)} className={`${CELDAS} text-slate-700 animate-resalte motion-reduce:animate-none`}>
            <span className="text-right text-[10px] text-slate-300">{i + 2}</span>
            <span className="truncate">{f.nombre}</span>
            <span className="truncate text-slate-500">{f.pasaporte}</span>
            <span className="tabular-nums">{f.caduca}</span>
          </div>
        ))}
        <div className={`${CELDAS} border-b-0`}>
          <span className="text-right text-[10px] text-slate-300">5</span><span>&nbsp;</span>
        </div>
      </div>
    </div>
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
        {FILAS.map((f, i) => {
          const llega = i * DESFASE + 2 * TRAMO;
          return (
            <li key={f.nombre} style={en(llega - 0.3)} className="flex items-center gap-3 px-4 py-2.5 animate-resalte motion-reduce:animate-none">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aproba-50 text-[10px] font-bold text-aproba-700 ring-1 ring-aproba-100">{f.iniciales}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-900">{f.nombre}</span>
                <span className="block truncate text-[11px] text-slate-500">Ficha · renovación {f.caduca}</span>
              </span>
              <span style={en(llega)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aproba-600 text-white animate-sello motion-reduce:animate-none">
                <Check className="h-3 w-3" />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// La IA: una onda por cada paquete que entra.
function Nodo() {
  return (
    <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
      {FILAS.map((f, i) => (
        <span key={f.nombre} aria-hidden="true" style={en(i * DESFASE + TRAMO)} className="absolute inset-0 rounded-full bg-aproba-400/40 animate-latido motion-reduce:hidden" />
      ))}
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-aproba-500 to-aproba-700 text-white shadow-float ring-4 ring-white">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z" /></svg>
      </span>
    </div>
  );
}

// El hilo entre dos piezas y sus tres paquetes: tramo 1 = el dato en bruto (gris), tramo 2 = ya
// reconocido por la IA (verde, con ✓). Cada paquete es una capa del tamaño del hilo con la
// pastilla en su extremo, que viaja de −100 % a 0. De izquierda a derecha en escritorio, de
// arriba abajo en móvil.
function Hilo({ tramo }: { tramo: 1 | 2 }) {
  const salida = tramo === 1 ? 0 : TRAMO;
  const pastilla = `whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
    tramo === 1 ? "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200" : "bg-aproba-600 text-white shadow-[0_0_14px_rgba(16,176,131,0.55)]"
  }`;
  const contenido = (f: (typeof FILAS)[number]) => (
    <>{tramo === 2 && <Check className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />}{f.corto}</>
  );
  return (
    <>
      <div aria-hidden="true" className="relative hidden h-12 overflow-hidden lg:block">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-slate-200 via-aproba-300 to-slate-200" />
        {FILAS.map((f, i) => (
          <span key={f.nombre} style={en(i * DESFASE + salida)} className="absolute inset-0 animate-viaje-x motion-reduce:hidden">
            <span className={`absolute right-1 top-1/2 -translate-y-1/2 ${pastilla}`}>{contenido(f)}</span>
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="relative mx-auto h-16 w-32 overflow-hidden lg:hidden">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-slate-200 via-aproba-300 to-slate-200" />
        {FILAS.map((f, i) => (
          <span key={f.nombre} style={en(i * DESFASE + salida)} className="absolute inset-0 animate-viaje-y motion-reduce:hidden">
            <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 ${pastilla}`}>{contenido(f)}</span>
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
      {/* Trama de puntos, difuminada hacia los bordes */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.08)_1px,transparent_0)] [background-size:20px_20px] [mask-image:radial-gradient(60%_70%_at_50%_40%,black,transparent)]" />
      <div role="img" aria-label="Tu archivo de clientes pasa por la IA de Aproba, que reconoce las columnas, y cada cliente queda dentro con su ficha y su renovación vigilada." className={`relative mx-auto grid max-w-sm grid-cols-1 lg:max-w-none lg:items-center ${COLUMNAS}`}>
        <Hoja />
        <Hilo tramo={1} />
        <Nodo />
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
