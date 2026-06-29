"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { ClienteMin } from "@/lib/data/citas";

// Modal para crear una CITA PREVIA (consulta). El gestor escribe el nombre: si coincide
// con un cliente existente puede seleccionarlo (rellena email/teléfono y la vincula),
// o deja un nombre libre (prospecto / walk-in). Fecha obligatoria; aviso por email opcional.
export function NuevaCitaModal({ clientes, onClose }: { clientes: ClienteMin[]; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [lugar, setLugar] = useState("");
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [notificar, setNotificar] = useState(true);
  const [foco, setFoco] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = nombre.trim().toLowerCase();
  const matches = clienteId || q.length < 2 ? [] : clientes
    .filter((c) => `${c.nombre} ${c.apellidos ?? ""}`.toLowerCase().includes(q))
    .slice(0, 6);

  function elegir(c: ClienteMin) {
    setClienteId(c.id);
    setNombre(`${c.nombre} ${c.apellidos ?? ""}`.trim());
    setEmail(c.email ?? "");
    setTelefono(c.telefono ?? "");
    setFoco(false);
  }

  async function crear() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/citas-previas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, nombre, email, telefono, fecha, hora, lugar, motivo, notas, notificar: notificar && Boolean(email.trim()) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo crear la cita."));
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo crear la cita."));
    } finally { setBusy(false); }
  }

  const fld = "w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="mt-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">{t("Nueva cita")}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label={t("Cerrar")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Cliente: búsqueda + nombre libre */}
          <div className="relative sm:col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Cliente")} <span className="text-amber-500">*</span></label>
            <input
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setClienteId(null); setFoco(true); }}
              onFocus={() => setFoco(true)}
              placeholder={t("Nombre del cliente o prospecto…")}
              className={fld}
            />
            {clienteId && <span className="mt-1 inline-block text-[11px] font-medium text-aproba-700">✓ {t("Cliente vinculado")}</span>}
            {foco && matches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {matches.map((c) => (
                  <button key={c.id} onClick={() => elegir(c)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span className="font-medium text-slate-700">{c.nombre} {c.apellidos}</span>
                    <span className="truncate text-xs text-slate-400">{c.email ?? c.telefono ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Email")}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fld} />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Teléfono")}</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={fld} />
          </div>

          <div>
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Fecha")} <span className="text-amber-500">*</span></label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={fld} />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Hora")}</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={fld} />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Lugar")}</label>
            <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder={t("Oficina, videollamada, dirección…")} className={fld} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Motivo")}</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t("Consulta inicial, revisión de documentación…")} className={fld} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Notas internas")}</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={`${fld} resize-none`} />
          </div>
        </div>

        <label className={`mt-4 flex items-center gap-2 text-sm ${email.trim() ? "text-slate-600" : "text-slate-300"}`}>
          <input type="checkbox" checked={notificar && Boolean(email.trim())} disabled={!email.trim()} onChange={(e) => setNotificar(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
          {t("Enviar confirmación por email al cliente")}
        </label>

        {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">{t("Cancelar")}</button>
          <button onClick={crear} disabled={busy || !nombre.trim() || !fecha} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
            {busy ? t("Creando…") : t("Crear cita")}
          </button>
        </div>
      </div>
    </div>
  );
}
