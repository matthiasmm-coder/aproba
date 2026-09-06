"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// Ajustes → integración Google Calendar/Meet del despacho («OAuth por gestor»).
// Autocontenido: consulta su estado en /api/integraciones/google y lee el resultado
// del flujo OAuth en ?google=… (ok | denegado | error | sinconfig | sinmigrar).
// Conectar = navegación completa (el flujo OAuth redirige fuera y vuelve a Ajustes).
export function GoogleCalendarConfig() {
  const t = useT();
  const [estado, setEstado] = useState<{ configurado: boolean; conectado: boolean; caducada: boolean } | null>(null);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = () => {
    fetch("/api/integraciones/google")
      .then((r) => r.json())
      .then((d) => setEstado({ configurado: Boolean(d?.configurado), conectado: Boolean(d?.conectado), caducada: Boolean(d?.caducada) }))
      .catch(() => setEstado({ configurado: false, conectado: false, caducada: false }));
  };

  useEffect(() => {
    cargar();
    const p = new URLSearchParams(window.location.search).get("google");
    if (!p) return;
    const MSGS: Record<string, { tono: "ok" | "error"; texto: string }> = {
      ok: { tono: "ok", texto: t("Google conectado. Ya puedes crear reuniones de Meet automáticamente desde Nueva cita.") },
      denegado: { tono: "error", texto: t("Conexión cancelada en Google. No se ha guardado nada.") },
      error: { tono: "error", texto: t("No se pudo completar la conexión con Google. Inténtalo de nuevo.") },
      sinconfig: { tono: "error", texto: t("La integración con Google aún no está configurada en la plataforma.") },
      sinmigrar: { tono: "error", texto: t("Falta la migración: ejecuta supabase/google-calendar.sql y vuelve a conectar.") },
    };
    if (MSGS[p]) setAviso(MSGS[p]);
    // Limpia el parámetro para que el aviso no reaparezca al refrescar.
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function desconectar() {
    if (!(await confirmar({ mensaje: t("¿Desconectar Google? Las citas ya creadas conservan sus enlaces."), confirmarLabel: t("Desconectar") }))) return;
    setBusy(true);
    try {
      const r = await fetch("/api/integraciones/google/desconectar", { method: "POST" });
      if (r.ok) { setAviso(null); cargar(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-slate-800">{t("Videollamadas · Google Meet")}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {t("Conecta la cuenta de Google del despacho y cada cita creará su Meet automáticamente. Sin conexión, pega el enlace a mano.")}
          </p>
        </div>
        {estado === null ? (
          <span className="text-xs text-slate-400">…</span>
        ) : estado.conectado ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-aproba-100 px-2.5 py-1 text-xs font-semibold text-aproba-700">
              <span className="h-1.5 w-1.5 rounded-full bg-aproba-600" /> {t("Conectado")}
            </span>
            <button onClick={desconectar} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50">
              {t("Desconectar")}
            </button>
          </div>
        ) : estado.caducada ? (
          // Credencial guardada que Google ya NO acepta: decirlo claramente en vez de
          // fingir «Conectado» y fallar al guardar la cita.
          <div className="flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {t("Conexión caducada")}
            </span>
            <p className="max-w-md text-[11px] leading-relaxed text-slate-500">
              {t("Google ya no acepta la conexión (caduca sola cada 7 días mientras la app esté en modo de prueba, o si revocaste el acceso). Vuelve a conectarla; mientras tanto, puedes pegar el enlace de la reunión a mano.")}
            </p>
            <div className="flex items-center gap-2">
              <a href="/api/integraciones/google/conectar" className="inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-aproba-700">
                {t("Volver a conectar")}
              </a>
              <button onClick={desconectar} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50">
                {t("Desconectar")}
              </button>
            </div>
          </div>
        ) : estado.configurado ? (
          <a href="/api/integraciones/google/conectar" className="inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-aproba-700">
            {t("Conectar con Google")}
          </a>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{t("Próximamente")}</span>
        )}
      </div>
      {aviso && (
        <p role="status" className={`mx-auto mt-3 max-w-xl rounded-md border px-3 py-2 text-xs ${aviso.tono === "ok" ? "border-aproba-200 bg-aproba-50 text-aproba-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
