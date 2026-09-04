import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO, whatsappUrl } from "@/lib/contacto";
import { RegistrarEscaneo } from "@/components/registrar-escaneo";

// Página de la TARJETA (03/09/2026): el QR grabado en la tarjeta de metal apunta aquí.
// Es una dirección que controlamos: si cambia el teléfono o el canal, se cambia esta
// página y las tarjetas ya impresas siguen funcionando. Pensada para móvil: quien la
// abre acaba de escanear un código delante de nosotros.
export const metadata: Metadata = {
  title: `${CONTACTO.nombre} · ${CONTACTO.empresa}`,
  description: CONTACTO.claim,
  robots: { index: false, follow: false }, // ficha de contacto, no contenido para buscadores
};

const IconWhatsApp = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.2-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5v-.5c0-.2-.7-1.6-.9-2.2-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3M12 22a10 10 0 0 1-5.1-1.4L2 22l1.4-4.8A10 10 0 1 1 12 22" /></svg>
);
const IconContacto = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
);
const IconTel = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L8 9.8a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" /></svg>
);
const IconMail = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="2" y="4.5" width="20" height="15" rx="2.5" /><path d="m2.6 6.8 9.4 5.6 9.4-5.6" /></svg>
);

export default async function TarjetaPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;

  return (
    <main className="flex min-h-[100svh] flex-col items-center bg-cream-50 px-5 pb-10 pt-14">
      <RegistrarEscaneo fuente={s ?? null} />

      <img src="/icon-512.png" alt="" className="h-16 w-16 rounded-2xl" />
      <h1 className="mt-5 text-center text-2xl font-bold tracking-tightest text-slate-900">{CONTACTO.nombre}</h1>
      <p className="mt-1 text-sm font-semibold uppercase tracking-[.16em] text-aproba-700">{CONTACTO.cargo}</p>
      <p className="mt-3 text-center text-sm text-slate-500">
        <span className="font-semibold text-slate-700">{CONTACTO.empresa}</span> · {CONTACTO.claim}
      </p>

      <div className="mt-8 grid w-full max-w-sm gap-2.5">
        <a
          href={whatsappUrl()}
          className="flex items-center justify-center gap-2.5 rounded-2xl bg-aproba-600 px-5 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-aproba-700"
        >
          {IconWhatsApp} Escríbeme por WhatsApp
        </a>
        <a
          href="/m/vcard"
          className="flex items-center justify-center gap-2.5 rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base font-semibold text-slate-800 transition hover:border-slate-400"
        >
          {IconContacto} Guardar mi contacto
        </a>
        <div className="grid grid-cols-2 gap-2.5">
          <a href={`tel:${CONTACTO.telefono}`} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400">
            {IconTel} Llamar
          </a>
          <a href={`mailto:${CONTACTO.email}`} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400">
            {IconMail} Email
          </a>
        </div>
      </div>

      <div className="mt-8 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-900">¿Qué es Aproba?</p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Valida los documentos de tus clientes, rellena los formularios oficiales (EX, tasas 790) y avisa
          antes de cada caducidad. Para gestorías y abogados de extranjería en España.
        </p>
        <Link href="/" className="mt-3 inline-block text-sm font-semibold text-aproba-700 underline underline-offset-2">
          Ver Aproba
        </Link>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">
        {CONTACTO.telefonoVisible} · {CONTACTO.email}
      </p>
    </main>
  );
}
