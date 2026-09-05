"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

// Índice de artículos (05/09/2026): buscador por palabra clave + paginación de 5.
// Client component porque el buscador filtra en el navegador, pero TODO se pinta también
// en servidor: la primera página y sus enlaces «?p=N» existen en el HTML, que es lo que
// leen los buscadores. La búsqueda es local a propósito: son pocas decenas de artículos
// y el lector quiere una respuesta al teclear, no una petición.

export type ArticuloIndice = {
  slug: string;
  titulo: string;
  entradilla: string;
  descripcion: string;
  tema: string;
  fechaISO: string;
  fechaLarga: string;
  minutos: number;
  imagen: string;
  texto: string; // cuerpo aplanado, solo para buscar
};

const POR_PAGINA = 5;

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ArticulosLista({ articulos, pagina }: { articulos: ArticuloIndice[]; pagina: number }) {
  const [q, setQ] = useState("");
  const consulta = normalizar(q.trim());
  const palabras = consulta.split(/\s+/).filter((w) => w.length >= 2);

  // Con búsqueda: todos los que contengan TODAS las palabras (título, resumen, tema o
  // cuerpo), sin paginar. Sin búsqueda: la página pedida, de más reciente a más antiguo.
  const filtrados = useMemo(() => {
    if (!palabras.length) return null;
    return articulos.filter((a) => {
      const pajar = normalizar(`${a.titulo} ${a.entradilla} ${a.descripcion} ${a.tema} ${a.texto}`);
      return palabras.every((w) => pajar.includes(w));
    });
  }, [articulos, palabras]);

  const totalPaginas = Math.max(1, Math.ceil(articulos.length / POR_PAGINA));
  const p = Math.min(Math.max(1, pagina), totalPaginas);
  const visibles = filtrados ?? articulos.slice((p - 1) * POR_PAGINA, p * POR_PAGINA);

  return (
    <>
      <div className="mt-5">
        <label htmlFor="buscar-articulos" className="sr-only">Buscar artículos por palabra clave</label>
        <div className="relative max-w-xl">
          <svg aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            id="buscar-articulos"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por palabra clave: renovación, tasa, VeriFactu, honorarios…"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-[16px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm"
          />
        </div>
        {filtrados && (
          <p className="mt-2 text-xs text-slate-500" aria-live="polite">
            {filtrados.length === 0
              ? "Ningún artículo contiene esas palabras."
              : `${filtrados.length} ${filtrados.length === 1 ? "artículo" : "artículos"} para «${q.trim()}»`}
          </p>
        )}
      </div>

      <div className="mt-8 space-y-4">
        {visibles.map((a) => (
          <article key={a.slug} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-aproba-300 hover:shadow-card">
            <Link href={`/articulos/${a.slug}`} aria-hidden tabIndex={-1} className="block">
              <Image
                src={a.imagen}
                alt=""
                width={1536}
                height={1024}
                sizes="(max-width: 768px) 100vw, 768px"
                className="aspect-[2/1] w-full border-b border-slate-100 object-cover"
              />
            </Link>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="rounded-full bg-aproba-50 px-2 py-0.5 font-semibold text-aproba-700">{a.tema}</span>
                <time dateTime={a.fechaISO}>{a.fechaLarga}</time>
                <span>·</span>
                <span>{a.minutos} min de lectura</span>
              </div>
              <h2 className="mt-2 text-xl font-bold tracking-tightest text-slate-900">
                <Link href={`/articulos/${a.slug}`} className="transition hover:text-aproba-700">{a.titulo}</Link>
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{a.entradilla}</p>
              <Link href={`/articulos/${a.slug}`} className="mt-3 inline-block text-sm font-semibold text-aproba-700 hover:underline">
                Leer el artículo →
              </Link>
            </div>
          </article>
        ))}
      </div>

      {/* Paginación: solo sin búsqueda activa y si hay más de una página. Enlaces reales
          (?p=N) para que se puedan compartir y rastrear; la página actual no es un enlace. */}
      {!filtrados && totalPaginas > 1 && (
        <nav aria-label="Páginas de artículos" className="mt-8 flex items-center justify-center gap-1.5">
          {p > 1 ? (
            <Link href={p - 1 === 1 ? "/articulos" : `/articulos?p=${p - 1}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">← Anteriores</Link>
          ) : (
            <span className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-300">← Anteriores</span>
          )}
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) =>
            n === p ? (
              <span key={n} aria-current="page" className="rounded-lg bg-aproba-600 px-3 py-2 text-sm font-semibold text-white">{n}</span>
            ) : (
              <Link key={n} href={n === 1 ? "/articulos" : `/articulos?p=${n}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">{n}</Link>
            ),
          )}
          {p < totalPaginas ? (
            <Link href={`/articulos?p=${p + 1}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">Siguientes →</Link>
          ) : (
            <span className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-300">Siguientes →</span>
          )}
        </nav>
      )}
    </>
  );
}
