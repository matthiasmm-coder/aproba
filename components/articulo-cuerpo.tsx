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
          case "datos":
            return (
              <div key={i} className="my-6 grid gap-3 sm:grid-cols-3">
                {b.items.map((d, j) => (
                  <div key={j} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                    <p className="text-xl font-bold tracking-tightest text-slate-900">{d.valor}</p>
                    <p className="mt-0.5 text-xs leading-snug text-slate-500">{d.etiqueta}</p>
                  </div>
                ))}
              </div>
            );
          case "tabla":
            return (
              <figure key={i} className="my-6">
                {b.titulo && <figcaption className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{b.titulo}</figcaption>}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="tabla-articulo w-full border-collapse bg-white text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-cream-50/60">
                        {b.encabezados.map((h, j) => (
                          <th key={j} scope="col" className="px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.filas.map((fila, j) => (
                        <tr key={j} className={j < b.filas.length - 1 ? "border-b border-slate-100" : ""}>
                          {fila.map((c, k) => (
                            <td key={k} data-label={b.encabezados[k] ?? ""} className={`px-3.5 py-2.5 align-top leading-snug ${k === 0 ? "font-medium text-slate-900" : "text-slate-600"}`}>{conFormato(c)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {b.nota && <p className="mt-2 text-xs leading-relaxed text-slate-400">{b.nota}</p>}
              </figure>
            );
          case "rangos": {
            const pct = (v: number) => Math.min(100, Math.max(0, (v / b.techo) * 100));
            return (
              <figure key={i} className="my-6 rounded-xl border border-slate-200 bg-white p-5">
                <figcaption className="text-xs font-bold uppercase tracking-wide text-slate-500">{b.titulo}</figcaption>
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
                {b.nota && <p className="mt-3 text-xs leading-relaxed text-slate-400">{b.nota}</p>}
              </figure>
            );
          }
          case "hitos":
            return (
              <ol key={i} className="my-6 !list-none space-y-0 border-l-2 border-slate-200 !pl-0">
                {b.items.map((h, j) => (
                  <li key={j} className="relative pb-5 pl-6 last:pb-0">
                    <span className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white ${h.destacado ? "bg-aproba-600 ring-2 ring-aproba-200" : "bg-slate-300"}`} />
                    <p className={`text-xs font-bold uppercase tracking-wide ${h.destacado ? "text-aproba-700" : "text-slate-400"}`}>{h.fecha}</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">{h.titulo}</p>
                    {h.texto && <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{conFormato(h.texto)}</p>}
                  </li>
                ))}
              </ol>
            );
          case "faq":
            return (
              <section key={i} className="mt-10">
                <h2 id={`s${i}`}>Preguntas frecuentes</h2>
                <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {b.items.map((f, j) => (
                    <div key={j} className="p-4">
                      <h3 className="!mt-0 text-sm font-semibold text-slate-900">{f.q}</h3>
                      <p className="mt-1.5 !mb-0 text-sm leading-relaxed text-slate-600">{conFormato(f.a)}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          case "nota":
            return (
              <aside key={i} className="my-6 rounded-xl border border-aproba-200 bg-aproba-50/50 p-4">
                {b.titulo && <p className="text-xs font-bold uppercase tracking-wide text-aproba-700">{b.titulo}</p>}
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{conNegrita(b.texto)}</p>
              </aside>
            );
          default:
            return <p key={i}>{conNegrita(b.texto)}</p>;
        }
      })}
    </div>
  );
}
