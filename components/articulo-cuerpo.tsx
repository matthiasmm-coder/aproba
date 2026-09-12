import type { Bloque } from "@/lib/articulos";

// Pinta los bloques de un artículo. Server component: sin JS en el cliente para leer un
// texto. La tipografía la pone `legal-prose` (globals.css) — es prosa genérica, la
// comparten las páginas legales y los artículos; los bloques propios (datos, cita, nota)
// traen su estilo aquí.

import Link from "next/link";

// **negrita** → <strong> y [texto](/ruta) → <Link> (solo rutas internas: el contenido es
// nuestro y los enlaces internos entre artículos son parte del SEO). Nada más: un
// mini-lenguaje corto se lee mejor en el fichero de contenido que etiquetas.
function conFormato(texto: string): React.ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)]+\))/g);
  return partes.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>;
    const enlace = /^\[([^\]]+)\]\((\/[^)]+)\)$/.exec(p);
    if (enlace)
      return <Link key={i} href={enlace[2]} className="font-medium text-aproba-700 underline decoration-aproba-300 underline-offset-2 hover:text-aproba-800">{enlace[1]}</Link>;
    return <span key={i}>{p}</span>;
  });
}
const conNegrita = conFormato; // los bloques existentes siguen llamando conNegrita

// ── Lenguaje visual de las figuras (referencia desde el 12/09/2026) ──────────
// Una misma leyenda para todas: marca verde + versalitas finas. Los paneles son blancos,
// con línea fina slate-200 y esquinas 2xl; el verde solo marca dato, acento o resultado.
function Leyenda({ children }: { children: React.ReactNode }) {
  return (
    <figcaption className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-sm bg-aproba-600" />
      <span>{children}</span>
    </figcaption>
  );
}
const NotaFigura = ({ texto }: { texto?: string }) => (texto ? <p className="mt-3 text-xs leading-relaxed text-slate-400">{conFormato(texto)}</p> : null);
const dosCifras = (n: number) => String(n + 1).padStart(2, "0");

export function ArticuloCuerpo({ bloques }: { bloques: Bloque[] }) {
  return (
    <div className="legal-prose">
      {bloques.map((b, i) => {
        switch (b.t) {
          case "h2":
            return <h2 key={i} id={`s${i}`}>{b.texto}</h2>;
          case "h3":
            return <h3 key={i}>{b.texto}</h3>;
          case "ul":
            return <ul key={i}>{b.items.map((x, j) => <li key={j}>{conNegrita(x)}</li>)}</ul>;
          case "ol":
            return <ol key={i}>{b.items.map((x, j) => <li key={j}>{conNegrita(x)}</li>)}</ol>;
          case "cita":
            return (
              <blockquote key={i} className="my-6 border-l-2 border-aproba-300 pl-4">
                <p className="text-base italic text-slate-700">«{b.texto}»</p>
                <cite className="mt-1 block text-xs not-italic text-slate-400">{b.autor}</cite>
              </blockquote>
            );
          case "datos": {
            // Banda única dividida en celdas iguales: 2 por fila en móvil, todas en una fila en
            // escritorio (nunca una tarjeta huérfana). La cifra en verde, tabular.
            const cols = b.items.length === 3 ? "sm:grid-cols-3" : b.items.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-2";
            return (
              <div key={i} className={`my-7 grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white ${cols}`}>
                {b.items.map((d, j) => (
                  <div key={j} className={`px-4 py-4 sm:px-5 sm:py-5 ${j % 2 === 1 ? "border-l border-slate-200" : ""} ${j >= 2 ? "border-t border-slate-200" : ""} sm:border-t-0 ${j > 0 ? "sm:border-l" : ""}`}>
                    {/* Tamaño según la longitud: una fecha o un importe largo no debe partirse ni recortarse. */}
                    <p className={`font-bold leading-none tracking-tightest text-aproba-700 tabular-nums ${d.valor.length <= 7 ? "text-[1.65rem] sm:text-[1.9rem]" : d.valor.length <= 10 ? "text-[1.35rem] sm:text-[1.5rem]" : "text-[1.15rem] sm:text-[1.25rem]"}`}>{d.valor}</p>
                    <p className="mt-2 text-[11.5px] leading-snug text-slate-500">{d.etiqueta}</p>
                  </div>
                ))}
              </div>
            );
          }
          case "tabla":
            return (
              <figure key={i} className="my-7">
                {b.titulo && <div className="mb-2.5"><Leyenda>{b.titulo}</Leyenda></div>}
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="tabla-articulo w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        {b.encabezados.map((h, j) => (
                          <th key={j} scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.filas.map((fila, j) => (
                        <tr key={j} className={`${j < b.filas.length - 1 ? "border-b border-slate-100" : ""} ${j % 2 === 1 ? "bg-cream-50/50" : ""}`}>
                          {/* El contenido va en UN span: en móvil la celda es un grid «etiqueta | valor» y sin él cada nodo (negrita, texto) caía en una columna distinta. */}
                          {fila.map((c, k) => (
                            <td key={k} data-label={b.encabezados[k] ?? ""} className={`px-4 py-3 align-top leading-snug ${k === 0 ? "font-semibold text-slate-900" : "text-slate-600"}`}><span>{conFormato(c)}</span></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <NotaFigura texto={b.nota} />
              </figure>
            );
          case "rangos": {
            const pct = (v: number) => Math.min(100, Math.max(0, (v / b.techo) * 100));
            return (
              <figure key={i} className="my-7 rounded-2xl border border-slate-200 bg-white p-5">
                <Leyenda>{b.titulo}</Leyenda>
                <div className="mt-4 space-y-3.5">
                  {b.items.map((r, j) => (
                    <div key={j}>
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-slate-800">{r.etiqueta}</span>
                        <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">{r.min}–{r.max} {b.unidad}</span>
                      </div>
                      <div className="relative h-2.5 rounded-full bg-slate-100">
                        <div
                          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-aproba-400 to-aproba-600"
                          style={{ left: `${pct(r.min)}%`, width: `${Math.max(2, pct(r.max) - pct(r.min))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <NotaFigura texto={b.nota} />
              </figure>
            );
          }
          case "barras": {
            const max = Math.max(1, ...b.items.map((x) => x.valor));
            return (
              <figure key={i} className="my-7 rounded-2xl border border-slate-200 bg-white p-5">
                <Leyenda>{b.titulo}</Leyenda>
                <div className="mt-4 space-y-2.5">
                  {b.items.map((r, j) => (
                    <div key={j} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-3">
                      <span className="truncate text-sm font-medium text-slate-800">{r.etiqueta}</span>
                      <div className="h-3 rounded-full bg-slate-100">
                        <div
                          className={`h-3 rounded-full ${r.destacado ? "bg-aproba-600" : "bg-aproba-300"}`}
                          style={{ width: `${Math.max(1.5, (r.valor / max) * 100)}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-xs tabular-nums text-slate-500">{r.valor.toLocaleString("es-ES")}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-right text-[11px] text-slate-400">{b.unidad}</p>
                <NotaFigura texto={b.nota} />
              </figure>
            );
          }
          case "esquema": {
            // Diagrama de convergencia: N nodos → un carril → un destino. Los conectores son un
            // SVG estirado (preserveAspectRatio none + trazo no escalable): los centros de los
            // nodos caen siempre en (2k+1)/2N del ancho, así que el dibujo cuadra con la rejilla
            // en cualquier ancho. En móvil los nodos se apilan sobre un carril vertical.
            const n = b.nodos.length;
            const cx = (k: number) => ((2 * k + 1) * 100) / (2 * n);
            const cols = n <= 1 ? "sm:grid-cols-1" : n === 2 ? "sm:grid-cols-2" : n === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4";
            return (
              <figure key={i} className="my-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <Leyenda>{b.titulo}</Leyenda>
                <div className={`mt-5 grid gap-3 sm:gap-4 ${cols} relative`}>
                  {/* carril vertical (solo móvil) */}
                  <span aria-hidden className="absolute bottom-0 left-[11px] top-3 w-px bg-slate-200 sm:hidden" />
                  {b.nodos.map((nd, j) => (
                    <div key={j} className="relative pl-7 sm:pl-0">
                      <span aria-hidden className={`absolute left-[7px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-white sm:hidden ${nd.destacado ? "bg-aproba-600" : "bg-slate-300"}`} />
                      <div className={`h-full rounded-xl border p-4 ${nd.destacado ? "border-aproba-300 bg-aproba-50/50" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className={`text-[10.5px] font-semibold tabular-nums tracking-[0.1em] ${nd.destacado ? "text-aproba-700" : "text-slate-400"}`}>{dosCifras(j)}</span>
                          {nd.cifra && <span className="whitespace-nowrap text-xs font-bold tabular-nums text-aproba-700">{nd.cifra}</span>}
                        </div>
                        <p className="mt-1.5 text-sm font-semibold leading-snug text-slate-900">{nd.titulo}</p>
                        {nd.texto && <p className="mt-1 text-xs leading-relaxed text-slate-600">{nd.texto}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {/* conectores (escritorio): tirantes desde cada nodo, carril y bajada al destino */}
                <div aria-hidden className="hidden sm:block">
                  <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="h-[26px] w-full text-slate-300">
                    {b.nodos.map((_, j) => <line key={j} x1={cx(j)} y1="0" x2={cx(j)} y2="11" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
                    {n > 1 && <line x1={cx(0)} y1="11" x2={cx(n - 1)} y2="11" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
                    <line x1="50" y1="11" x2="50" y2="26" stroke="#0E8C5F" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="-mt-1 flex justify-center text-aproba-600">
                    <svg viewBox="0 0 12 8" className="h-2 w-3" fill="currentColor"><path d="M0 0h12L6 8z" /></svg>
                  </div>
                </div>
                {/* conector (móvil): bajada corta al destino */}
                <div aria-hidden className="ml-[11px] h-5 w-px bg-aproba-600 sm:hidden" />
                <div className="mt-1 rounded-xl bg-slate-900 px-5 py-4 text-center sm:mt-2">
                  <p className="text-sm font-bold text-white">{b.destino.titulo}</p>
                  {b.destino.texto && <p className="mt-1 text-xs leading-relaxed text-slate-300">{b.destino.texto}</p>}
                </div>
                <NotaFigura texto={b.nota} />
              </figure>
            );
          }
          case "hitos":
            return (
              <ol key={i} className="relative my-7 !list-none !pl-0">
                {b.items.map((h, j) => (
                  <li key={j} className="relative !m-0 pl-8 pb-5 last:pb-0">
                    {/* carril por tramo: de esta pastilla a la siguiente, así termina exactamente en la última */}
                    {j < b.items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[7px] top-6 w-px bg-slate-200" />}
                    <span aria-hidden className={`absolute left-0 top-[9px] h-[15px] w-[15px] rounded-full border-[3px] border-white ${h.destacado ? "bg-aproba-600 ring-1 ring-aproba-300" : "bg-slate-300 ring-1 ring-slate-200"}`} />
                    <div className={h.destacado ? "-ml-3 rounded-xl border border-aproba-200 bg-aproba-50/60 px-4 py-3" : ""}>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${h.destacado ? "bg-aproba-600 text-white" : "bg-slate-100 text-slate-500"}`}>{h.fecha}</span>
                      <p className="mt-1.5 text-sm font-semibold leading-snug text-slate-900">{h.titulo}</p>
                      {h.texto && <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{conFormato(h.texto)}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            );
          case "faq":
            return (
              <section key={i} className="mt-10">
                <h2 id={`s${i}`}>Preguntas frecuentes</h2>
                <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                  {b.items.map((f, j) => (
                    <div key={j} className="p-5">
                      <h3 className="!mt-0 text-sm font-semibold text-slate-900">{f.q}</h3>
                      <p className="mt-1.5 !mb-0 text-sm leading-relaxed text-slate-600">{conFormato(f.a)}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          case "nota":
            return (
              <aside key={i} className="my-7 rounded-2xl border border-aproba-200 bg-aproba-50/50 p-5">
                {b.titulo && <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-aproba-700"><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-sm bg-aproba-600" />{b.titulo}</p>}
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{conNegrita(b.texto)}</p>
              </aside>
            );
          default:
            return <p key={i}>{conNegrita(b.texto)}</p>;
        }
      })}
    </div>
  );
}
