"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

type Svc = { nombre: string; desde: string; para: string; features: string[]; destacado: boolean };

const SERVICIOS: Svc[] = [
  { nombre: "Puesta en marcha", desde: "140", para: "Empieza sin mover un dedo", features: ["Configuración de tu cuenta", "Migración de tus datos y expedientes"], destacado: false },
  { nombre: "Aproba Despegue", desde: "240", para: "Tu equipo, operativo desde el día uno", features: ["Configuración de tu cuenta", "Migración de tus datos y expedientes", "Formación: 2 h en directo + vídeos y documentación"], destacado: true },
];

function Tick() {
  return <svg className="mt-0.5 h-4 w-4 shrink-0 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

export function ServiciosImplantacion() {
  const [openSvc, setOpenSvc] = useState<Svc | null>(null);

  return (
    <div className="mt-16">
      <h3 className="text-center text-xl font-semibold tracking-tightest text-slate-900">Servicios de implantación <span className="font-normal text-slate-500">(opcionales)</span></h3>
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-600">Te dejamos la cuenta lista y a tu equipo formado. Se añaden al contratar cualquier plan.</p>
      <div className="mx-auto mt-8 grid max-w-4xl gap-6 md:grid-cols-2">
        {SERVICIOS.map((s) => (
          <div key={s.nombre} className={`relative flex h-full flex-col rounded-2xl border p-7 ${s.destacado ? "border-aproba-600 bg-cream-50 shadow-card" : "border-slate-200 bg-white"}`}>
            {s.destacado && <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-aproba-600 px-3 py-1 text-xs font-semibold text-white">Recomendado</span>}
            <h4 className="text-center text-lg font-semibold text-slate-900">{s.nombre}</h4>
            <p className="mt-1 text-center text-sm text-slate-500">{s.para}</p>
            <p className="mt-5 text-center"><span className="text-sm text-slate-500">desde </span><span className="text-3xl font-bold tracking-tightest text-slate-900">{s.desde}&nbsp;€</span><span className="text-slate-500"> + IVA</span></p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-600">
              {s.features.map((f) => (<li key={f} className="flex items-start gap-2"><Tick />{f}</li>))}
            </ul>
            <button onClick={() => setOpenSvc(s)} className={`mt-7 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${s.destacado ? "bg-aproba-600 text-white hover:bg-aproba-700" : "border border-slate-300 text-slate-700 hover:border-slate-400"}`}>Solicitar presupuesto</button>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-slate-400">Migración según volumen de expedientes · autoservicio gratuito · bonificada con plan anual.</p>
      {openSvc && <PresupuestoModal servicio={openSvc} onClose={() => setOpenSvc(null)} />}
    </div>
  );
}

function PresupuestoModal({ servicio, onClose }: { servicio: Svc; onClose: () => void }) {
  const esDespegue = servicio.nombre === "Aproba Despegue";
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ servicio: servicio.nombre, nombre: "", empresa: "", email: "", telefono: "", expedientes: "", participantes: "", comentarios: "", website: "" });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.nombre.trim().length < 2) { setError("Indica tu nombre."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("Introduce un email válido."); return; }
    if (!form.empresa.trim()) { setError("Indica tu despacho o empresa."); return; }
    if (!form.telefono.trim()) { setError("Indica un teléfono de contacto."); return; }
    if (!form.expedientes.trim()) { setError("Indica el nº de expedientes a migrar."); return; }
    if (esDespegue && !form.participantes.trim()) { setError("Indica el nº de personas a formar."); return; }
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
                <p className="text-sm font-semibold text-slate-900">{servicio.nombre}</p>
                <p className="shrink-0 text-sm text-slate-600">desde <span className="font-semibold text-slate-900">{servicio.desde}&nbsp;€</span> + IVA</p>
              </div>
              <p className="mt-1 text-xs italic leading-relaxed text-slate-600">Incluye: {servicio.features.join(" · ")}.</p>
              <p className="mt-1.5 text-xs font-medium text-slate-500">Pago único · IVA no incluido.</p>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div><label className={label}>Nombre y apellidos *</label><input value={form.nombre} onChange={set("nombre")} className={inp} placeholder="Tu nombre" /></div>
              <div><label className={label}>Despacho / empresa *</label><input value={form.empresa} onChange={set("empresa")} className={inp} placeholder="Nombre de tu despacho" /></div>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div><label className={label}>Email *</label><input type="email" value={form.email} onChange={set("email")} className={inp} placeholder="tucorreo@despacho.com" /></div>
              <div><label className={label}>Teléfono *</label><input type="tel" value={form.telefono} onChange={set("telefono")} className={inp} placeholder="600 000 000" /></div>
            </div>
            <div className={`grid gap-3.5 ${esDespegue ? "sm:grid-cols-2" : ""}`}>
              <div><label className={label}>Expedientes a migrar *</label><input inputMode="numeric" value={form.expedientes} onChange={set("expedientes")} className={inp} placeholder="Nº aproximado" /></div>
              {esDespegue && <div><label className={label}>Personas a formar *</label><input inputMode="numeric" value={form.participantes} onChange={set("participantes")} className={inp} placeholder="Nº de asistentes" /></div>}
            </div>
            <div><label className={label}>Comentarios</label><textarea value={form.comentarios} onChange={set("comentarios")} rows={3} className={inp} placeholder="Cuéntanos tu situación: programa actual, plazos…" /></div>
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
