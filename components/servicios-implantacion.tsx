"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

// UN solo servicio de implantación (decidido 2026-07-17): un choix binaire fait décider,
// un menu à deux lignes fait hésiter. Config + migración son fijas, la formación escala
// por persona. Grille interne (devis, PAS sur la landing) : base 390 € + 300 €/persona
// → 1 p. 690 · 2 p. 990 · 3 p. 1.290 · 4 p. 1.590 · 5 p. 1.890. La promesa del título
// es "aprovechar el 100 %" (sacar todo el valor desde el día uno), no "usar todas las
// funciones" (nadie lo hace): ver doctrine servicio.

const SERVICIO = {
  nombre: "Aproba Despegue",
  desde: "690",
  para: "Tu cuenta lista, tus datos migrados y tu equipo formado",
  features: [
    "Configuración a medida de tu cuenta: servicios, tarifas, cobros y equipo",
    "Migración de tus datos: tus clientes y tus expedientes en curso",
    "Formación práctica de tu equipo, sobre tu propia cuenta y tus casos reales",
    "Acompañamiento prioritario durante las primeras semanas",
  ],
};

const EQUIPO_OPCIONES = ["Autónomo (solo yo)", "2 personas", "3 personas", "4 personas", "5 personas", "Más de 5"];

function Tick() {
  return <svg className="mt-0.5 h-4 w-4 shrink-0 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

export function ServiciosImplantacion() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-16">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-aproba-700">Servicio opcional</p>
      <h3 className="mt-2 text-center text-xl font-semibold tracking-tightest text-slate-900">Aprovecha el 100 % de Aproba desde el primer día</h3>
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-600">Sin perder semanas configurando y aprendiendo por tu cuenta: te dejamos la cuenta a punto y a tu equipo trabajando a pleno rendimiento.</p>
      <div className="mx-auto mt-8 max-w-md">
        <div className="relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-aproba-600 px-3 py-1 text-xs font-semibold text-white">Recomendado</span>
          <h4 className="text-center text-lg font-semibold text-slate-900">{SERVICIO.nombre}</h4>
          <p className="mt-1 text-center text-sm text-slate-500">{SERVICIO.para}</p>
          <p className="mt-5 text-center"><span className="text-sm text-slate-500">desde </span><span className="text-3xl font-bold tracking-tightest text-slate-900">{SERVICIO.desde}&nbsp;€</span><span className="text-slate-500"> + IVA</span></p>
          <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-600">
            {SERVICIO.features.map((f) => (<li key={f} className="flex items-start gap-2"><Tick />{f}</li>))}
          </ul>
          <button onClick={() => setOpen(true)} className="mt-7 block rounded-lg bg-aproba-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-aproba-700">Solicitar presupuesto</button>
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-slate-400">Pago único · presupuesto según el tamaño de tu equipo · también puedes empezar por tu cuenta, sin coste.</p>
      {open && <PresupuestoModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function PresupuestoModal({ onClose }: { onClose: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ servicio: SERVICIO.nombre, nombre: "", apellidos: "", email: "", telefono: "", equipo: "", comentarios: "", website: "" });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.nombre.trim().length < 2) { setError("Indica tu nombre."); return; }
    if (form.apellidos.trim().length < 2) { setError("Indica tus apellidos."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("Introduce un email válido."); return; }
    if (!form.telefono.trim()) { setError("Indica un teléfono de contacto."); return; }
    if (!form.equipo) { setError("Indica cuántas personas sois."); return; }
    setEnviando(true);
    try {
      const r = await fetch("/api/presupuesto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo enviar. Inténtalo de nuevo.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const label = "mb-1 block text-sm font-medium text-slate-700";
  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !enviando && onClose()}>
      <div className="my-6 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tightest text-slate-900">Solicitar presupuesto</h3>
            <p className="mt-0.5 text-sm text-slate-500">Te respondemos con precio y fechas en menos de 24 h laborables.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>

        {done ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-aproba-100"><svg className="h-6 w-6 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
            <p className="mt-4 font-semibold text-slate-900">¡Solicitud enviada!</p>
            <p className="mt-1 text-sm text-slate-600">Gracias{form.nombre.trim() ? `, ${form.nombre.trim().split(" ")[0]}` : ""}. Te enviaremos un presupuesto a medida con precio y fechas.</p>
            <button onClick={onClose} className="mt-6 rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3.5">
            <div className="rounded-lg border border-aproba-100 bg-aproba-50 px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{SERVICIO.nombre}</p>
                <p className="shrink-0 text-sm text-slate-600">desde <span className="font-semibold text-slate-900">{SERVICIO.desde}&nbsp;€</span> + IVA</p>
              </div>
              <p className="mt-1 text-xs italic leading-relaxed text-slate-600">Configuración, migración de datos y expedientes, formación de tu equipo y acompañamiento.</p>
              <p className="mt-1.5 text-xs font-medium text-slate-500">Pago único · IVA no incluido.</p>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div><label className={label}>Nombre *</label><input value={form.nombre} onChange={set("nombre")} className={inp} placeholder="Tu nombre" /></div>
              <div><label className={label}>Apellidos *</label><input value={form.apellidos} onChange={set("apellidos")} className={inp} placeholder="Tus apellidos" /></div>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div><label className={label}>Email *</label><input type="email" value={form.email} onChange={set("email")} className={inp} placeholder="tucorreo@despacho.com" /></div>
              <div><label className={label}>Teléfono *</label><input type="tel" value={form.telefono} onChange={set("telefono")} className={inp} placeholder="600 000 000" /></div>
            </div>
            <div>
              <label className={label}>¿Cuántas personas sois? *</label>
              <select value={form.equipo} onChange={set("equipo")} className={`${inp} bg-white ${form.equipo ? "" : "text-slate-400"}`}>
                <option value="" disabled>Elige una opción</option>
                {EQUIPO_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div><label className={label}>Comentarios</label><textarea value={form.comentarios} onChange={set("comentarios")} rows={3} className={inp} placeholder="Cuéntanos tu situación: programa actual, expedientes a migrar, plazos…" /></div>
            <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} className="hidden" aria-hidden="true" />
            {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900">Cancelar</button>
              <button type="submit" disabled={enviando} className="rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">{enviando ? "Enviando…" : "Enviar solicitud"}</button>
            </div>
            <p className="text-center text-xs text-slate-400">Sin compromiso · te respondemos con un presupuesto a medida.</p>
          </form>
        )}
      </div>
    </div>
  );
}
