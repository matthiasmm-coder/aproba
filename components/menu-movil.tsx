"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Menú del móvil (Matthias, 30/09/2026 : « sur mobile, je ne vois pas comment on peut
// sélectionner l'un de ces onglets »): en pantallas estrechas la barra de enlaces no cabe,
// así que un botón ☰ abre un panel con los mismos enlaces. Se cierra al elegir un enlace, al
// tocar fuera o con Escape.
export type EnlaceMenu = { href: string; texto: string };

export function MenuMovil({ enlaces, entrar = false, className = "" }: { enlaces: EnlaceMenu[]; entrar?: boolean; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  return (
    <div ref={caja} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? "Cerrar el menú" : "Abrir el menú"}
        aria-expanded={abierto}
        aria-controls="menu-movil"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white/70 text-slate-700 transition hover:bg-white"
      >
        {abierto ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        )}
      </button>
      {abierto && (
        <nav id="menu-movil" aria-label="Menú" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-float">
          {enlaces.map((e) => (
            <Link key={e.href} href={e.href} onClick={() => setAbierto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-aproba-50 hover:text-aproba-700">
              {e.texto}
            </Link>
          ))}
          {entrar && (
            <Link href="/login" prefetch={false} onClick={() => setAbierto(false)} className="mt-1 block rounded-lg border-t border-slate-100 px-3 py-2.5 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50 sm:hidden">
              Entrar
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
