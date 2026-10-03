"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { copiarTexto } from "@/lib/copiar";

// FIRMA EN LÍNEA en la ficha del expediente (lib/firma): enviar documentos a firmar y seguir
// cada envío — enviado, abierto, firmado — con recordar, copiar el enlace y anular. El documento
// firmado entra solo en Documentos (con su certificado de firma).

type Doc = "hoja" | "mandato" | "presupuesto";
type Sobre = {
  id: string; estado: "pendiente" | "abierto" | "firmado" | "anulado" | "caducado";
  firmanteNombre: string | null; firmanteEmail: string | null;
  documentos: { doc: Doc; titulo: string; documentoId: string | null }[];
  enviadoAt: string | null; abiertoAt: string | null; firmadoAt: string | null; anuladoAt: string | null; expiraAt: string | null;
  recordatorios: number; createdAt: string; enlace: string | null;
};
type Datos = { activa: boolean; sobres: Sobre[]; porDefecto: Record<Doc, boolean>; email: string | null };

const NOMBRE: Record<Doc, string> = { hoja: "Hoja de encargo", mandato: "Mandato de representación", presupuesto: "Presupuesto" };
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const CHIP: Record<Sobre["estado"], string> = {
  pendiente: "bg-slate-100 text-slate-600", abierto: "bg-amber-50 text-amber-700", firmado: "bg-aproba-50 text-aproba-700",
  anulado: "bg-slate-100 text-slate-400 line-through", caducado: "bg-red-50 text-red-600",
};

export function FirmaExpediente({ expedienteId }: { expedienteId: string }) {
  const t = useT();
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [docs, setDocs] = useState<Record<Doc, boolean>>({ hoja: false, mandato: false, presupuesto: false });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/expedientes/${expedienteId}/firma`, { cache: "no-store" });
    if (r.ok) setDatos(await r.json());
  }, [expedienteId]);
  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = () => {
    if (!datos) return;
    setDocs({ ...datos.porDefecto, ...(!datos.porDefecto.hoja && !datos.porDefecto.mandato ? { presupuesto: true } : {}) });
    setEmail(datos.email ?? "");
    setError(""); setAbierto(true);
  };
  const enviar = async () => {
    const elegidos = (Object.keys(docs) as Doc[]).filter((d) => docs[d]);
    if (!elegidos.length) { setError(t("Elige al menos un documento.")); return; }
    setBusy("enviar"); setError("");
    try {
      const r = await fetch(`/api/expedientes/${expedienteId}/firma`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docs: elegidos, email: email.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo enviar."));
      setAbierto(false);
      setAviso(t("Enviado: el cliente recibe el enlace por email."));
      await cargar(); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo enviar.")); } finally { setBusy(""); }
  };
  const accion = async (s: Sobre, a: "recordar" | "anular") => {
    if (a === "anular" && !window.confirm(t("¿Anular este envío? El enlace dejará de funcionar."))) return;
    setBusy(`${a}:${s.id}`); setAviso("");
    try {
      const r = await fetch(`/api/expedientes/${expedienteId}/firma`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sobreId: s.id, accion: a }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo completar."));
      setAviso(a === "recordar" ? t("Recordatorio enviado.") : t("Envío anulado."));
      await cargar(); router.refresh();
    } catch (e) { setAviso(e instanceof Error ? e.message : t("No se pudo completar.")); } finally { setBusy(""); }
  };
  const copiar = async (s: Sobre) => {
    if (s.enlace && await copiarTexto(s.enlace)) { setAviso(t("Enlace copiado: puedes mandarlo por WhatsApp.")); }
  };

  if (!datos?.activa) return null;
  const visibles = datos.sobres.filter((s) => s.estado !== "anulado").slice(0, 4);
  const estadoTxt = (s: Sobre) => ({
    pendiente: s.enviadoAt ? `${t("Enviado")} ${fecha(s.enviadoAt)}` : t("Sin enviar"),
    abierto: `${t("Abierto")} ${fecha(s.abiertoAt)}`,
    firmado: `${t("Firmado")} ${fecha(s.firmadoAt)}`,
    anulado: t("Anulado"),
    caducado: t("Caducado"),
  })[s.estado];

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">✍️ {t("Firma en línea")}</p>
        <button type="button" onClick={abrir} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">{t("Enviar para firmar")}</button>
      </div>
      {visibles.length === 0 ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{t("El cliente firma desde el móvil, sin imprimir: revisa los documentos, firma con el dedo y confirma con un código que le llega por email.")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {visibles.map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-slate-800">{s.documentos.map((d) => t(NOMBRE[d.doc])).join(" · ")}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[s.estado]}`}>{s.estado === "firmado" ? "✓ " : ""}{estadoTxt(s)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">{s.firmanteNombre} · {s.firmanteEmail}{s.recordatorios > 0 ? ` · ${t("{n} recordatorio(s)").replace("{n}", String(s.recordatorios))}` : ""}</p>
              {(s.estado === "pendiente" || s.estado === "abierto") && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                  <button type="button" onClick={() => accion(s, "recordar")} disabled={Boolean(busy)} className="text-aproba-700 hover:underline disabled:opacity-40">{busy === `recordar:${s.id}` ? t("Enviando…") : s.enviadoAt ? t("Recordar") : t("Enviar")}</button>
                  {s.enlace && <button type="button" onClick={() => copiar(s)} className="text-aproba-700 hover:underline">{t("Copiar enlace")}</button>}
                  <button type="button" onClick={() => accion(s, "anular")} disabled={Boolean(busy)} className="text-slate-500 hover:text-red-600 hover:underline disabled:opacity-40">{t("Anular")}</button>
                </div>
              )}
              {s.estado === "caducado" && <p className="mt-1 text-xs text-slate-500">{t("El enlace caducó sin firma: vuelve a enviarlo.")}</p>}
            </li>
          ))}
        </ul>
      )}
      {aviso && <p role="status" className="mt-2 text-xs text-slate-600">{aviso}</p>}

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm sm:p-4" onClick={() => !busy && setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("Enviar para firmar")} className="mt-4 w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-left shadow-xl sm:my-8 sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">{t("Enviar para firmar")}</h2>
              <button type="button" onClick={() => setAbierto(false)} disabled={Boolean(busy)} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100" aria-label={t("Cerrar")}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-slate-500">{t("El cliente recibe un email con un enlace. Revisa los documentos en su móvil, firma una sola vez y confirma con un código. Te avisamos al firmar, y el documento firmado, con su certificado, queda en el expediente.")}</p>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Documentos")}</p>
            <div className="space-y-2">
              {(["hoja", "mandato", "presupuesto"] as const).map((d) => (
                <label key={d} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${docs[d] ? "border-aproba-300 bg-aproba-50/50" : "border-slate-200"}`}>
                  <input type="checkbox" checked={docs[d]} onChange={(e) => setDocs((x) => ({ ...x, [d]: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                  <span className="text-sm font-medium text-slate-800">{t(NOMBRE[d])}</span>
                  {d === "presupuesto" && <span className="ms-auto text-[11px] text-slate-400">{t("al firmarlo, lo acepta")}</span>}
                </label>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Email del cliente")}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@ejemplo.com" autoComplete="off"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm" />
              <span className="mt-1 block text-[11px] text-slate-400">{t("Ahí le llegan el enlace y el código de firma. Si la ficha no tenía email, se guarda.")}</span>
            </label>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} disabled={Boolean(busy)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">{t("Cancelar")}</button>
              <button type="button" onClick={enviar} disabled={Boolean(busy)} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">{busy === "enviar" ? t("Enviando…") : t("Enviar")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
