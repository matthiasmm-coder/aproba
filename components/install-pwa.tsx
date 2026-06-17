"use client";

import { useEffect, useState } from "react";

// Bouton « Instalar la app » (PWA). Gère les 3 cas :
//  - Chrome/Edge/Android : utilise l'événement beforeinstallprompt capturé par PwaRegister.
//  - iOS/Safari : pas d'événement → affiche les instructions « Compartir → Añadir a inicio ».
//  - Déjà installée (standalone) : n'affiche rien.
type BipEvent = Event & { prompt: () => void; userChoice: Promise<unknown> };

export function InstallPWA() {
  const [available, setAvailable] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setListo(true);
    const w = window as unknown as { __aprobaInstallPrompt?: BipEvent };
    const standaloneNow = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(standaloneNow);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    if (w.__aprobaInstallPrompt) setAvailable(true);
    const onInstallable = () => setAvailable(true);
    const onInstalled = () => { setAvailable(false); setStandalone(true); };
    window.addEventListener("aproba-installable", onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("aproba-installable", onInstallable); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!listo || standalone) return null;

  async function instalar() {
    const ev = (window as unknown as { __aprobaInstallPrompt?: BipEvent }).__aprobaInstallPrompt;
    if (ev) {
      ev.prompt();
      try { await ev.userChoice; } catch { /* annulé */ }
      (window as unknown as { __aprobaInstallPrompt?: BipEvent }).__aprobaInstallPrompt = undefined;
      setAvailable(false);
    } else if (ios) {
      setIosHint((v) => !v);
    }
  }

  const cta = (
    <button
      type="button"
      onClick={instalar}
      className="inline-flex items-center gap-2 rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
      Instalar la app
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <h3 className="text-sm font-semibold text-slate-800">Instala Aproba como app</h3>
      <p className="mt-1 text-sm text-slate-500">Accede a Aproba desde tu pantalla de inicio, como una aplicación, sin abrir el navegador.</p>
      <div className="mt-4">
        {available || ios ? cta : (
          <p className="text-xs text-slate-400">Abre Aproba en Chrome, Edge o Safari y usa la opción «Instalar» / «Añadir a la pantalla de inicio» del navegador.</p>
        )}
        {iosHint && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14" /></svg>
            En iPhone/iPad: pulsa <strong>Compartir</strong> y luego <strong>«Añadir a la pantalla de inicio»</strong>.
          </p>
        )}
      </div>
    </div>
  );
}
