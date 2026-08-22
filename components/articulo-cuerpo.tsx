import type { Bloque } from "@/lib/articulos";

// Pinta los bloques de un artículo. Server component: sin JS en el cliente para leer un
// texto. La tipografía la pone `legal-prose` (globals.css) — es prosa genérica, la
// comparten las páginas legales y los artículos; los bloques propios (datos, cita, nota)
// traen su estilo aquí.

// **negrita** → <strong>. Nada más: el contenido es nuestro, no hay HTML de terceros que
// sanear, y un mini-lenguaje corto se lee mejor en el fichero de contenido que etiquetas.
function conNegrita(texto: string): React.ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

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
