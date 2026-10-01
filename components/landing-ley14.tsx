import { Reveal } from "@/components/reveal";

// LEY 14/2013 EN LA PORTADA (01/10/2026, Matthias: «un argument de vente qui apparaît sur la
// landing»). Para el despacho que trabaja con empresas y relocation: cada supuesto de la
// movilidad internacional con su servicio, sus modelos MI, la empresa que paga y la
// renovación por su circuito (UGE-CE). Solo lo que el producto hace (lib/ley14.ts): la tasa
// 790-038 NO se genera (Cl@ve) y no se dice que se genere; tampoco se presenta por nosotros.
// Sin enlaces nuevos en la portada (regla de Matthias). La ficha de la derecha es una
// ilustración: nombres inventados.

const PUNTOS: { titulo: string; texto: string; icono: "maletin" | "doc" | "edificio" | "radar" }[] = [
  { titulo: "Un servicio por supuesto", texto: "Altamente cualificado, traslado intraempresarial, teletrabajador internacional y emprendedor, cada uno con su lista de documentos.", icono: "maletin" },
  { titulo: "Los modelos MI, rellenados solos", texto: "El MI-T del titular, el MI-F de cada familiar y el MI-TIE, con los datos que la IA ya validó.", icono: "doc" },
  { titulo: "La empresa en una sola ficha", texto: "Ella paga y el trabajador es el titular. Él y su familia suben sus documentos desde un portal en inglés o en su idioma.", icono: "edificio" },
  { titulo: "Su renovación, a tiempo", texto: "Cada autorización con su caducidad, y la renovación propuesta por su circuito, la UGE‑CE.", icono: "radar" },
];

function Icono({ nombre }: { nombre: (typeof PUNTOS)[number]["icono"] }) {
  const c = "h-5 w-5 text-aproba-600";
  const p = { className: c, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (nombre === "maletin") return <svg {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></svg>;
  if (nombre === "doc") return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13l2 2 4-4" /></svg>;
  if (nombre === "edificio") return <svg {...p}><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12l5-5" /></svg>;
}

// Una fila de la ficha ilustrada: hecho (verde) o pendiente (ámbar).
function Fila({ hecho, titulo, detalle }: { hecho: boolean; titulo: string; detalle: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${hecho ? "bg-aproba-600 text-white" : "border-2 border-amber-400 bg-white"}`}>
        {hecho && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{titulo}</span>
      <span className={`shrink-0 text-xs ${hecho ? "text-slate-500" : "font-semibold text-amber-700"}`}>{detalle}</span>
    </li>
  );
}

export function LandingLey14() {
  return (
    <section id="ley-14-2013" className="scroll-mt-20 border-y border-slate-200 bg-cream-50 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-aproba-700">Movilidad internacional · Ley 14/2013</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">Cualificados, traslados y nómadas digitales, en el mismo flujo</h2>
          <p className="mt-4 text-balance text-lg leading-relaxed text-slate-600">
            Para los despachos que trabajan con empresas: cada expediente de la Ley 14/2013 llega a la UGE‑CE con los documentos revisados y los modelos listos.
          </p>
          <ul className="mt-9 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {PUNTOS.map((p, i) => (
              <li key={p.titulo}>
                <Reveal delay={i * 80}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-card ring-1 ring-slate-900/[0.04]"><Icono nombre={p.icono} /></span>
                    <span>
                      <span className="block font-semibold text-slate-900">{p.titulo}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-slate-600">{p.texto}</span>
                    </span>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>

        {/* Ficha ilustrada de un expediente (nombres inventados). */}
        <Reveal className="mx-auto w-full max-w-md lg:max-w-none">
          <figure aria-label="Ejemplo de expediente de la Ley 14/2013 en Aproba" className="relative rounded-[24px] bg-white p-6 shadow-float ring-1 ring-slate-900/[0.06] sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-aproba-50 px-2.5 py-1 text-[11px] font-semibold text-aproba-700">Ley 14/2013 · UGE‑CE</span>
              <span className="font-mono text-xs text-slate-400">EXP-2026-0142</span>
            </div>
            <p className="mt-4 text-lg font-semibold text-slate-900">Profesional altamente cualificado</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-400">Titular</dt><dd className="truncate font-medium text-slate-700">Priya S. · ingeniera de datos</dd>
              <dt className="text-slate-400">Empresa</dt><dd className="truncate font-medium text-slate-700">Acme Iberia S.L. <span className="font-normal text-slate-400">· paga</span></dd>
              <dt className="text-slate-400">Familia</dt><dd className="truncate font-medium text-slate-700">Cónyuge e hija</dd>
            </dl>
            <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
              <Fila hecho titulo="Documentos revisados por la IA" detalle="11 de 11" />
              <Fila hecho titulo="MI-T del titular" detalle="Rellenado" />
              <Fila hecho titulo="MI-F de cada familiar" detalle="2 rellenados" />
              <Fila hecho={false} titulo="Tasa 790-038" detalle="En la sede" />
            </ul>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-cream-50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <svg className="h-4 w-4 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12l5-5" /></svg>
                Renovación vigilada
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-800">oct. 2029</span>
            </div>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
