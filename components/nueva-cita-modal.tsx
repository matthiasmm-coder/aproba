"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { ClienteMin } from "@/lib/data/citas";

const PRESETS_DURACION = [15, 30, 45, 60, 90, 120]; // minutos ofrecidos en el selector

// Modo MANUAL: vale el enlace de cualquier herramienta (Meet, Teams, Zoom…) — solo
// se exige una URL https. Atajos para crear la reunión en otra pestaña y pegarla.
const CREAR_REUNION = { meet: "https://meet.google.com/new", teams: "https://teams.live.com" } as const;
const ENLACE_HTTPS = /^https:\/\/\S{4,480}$/;

// Proveedor deducido del HOST del enlace (mismo criterio que el servidor): etiqueta
// el botón «Unirse» de la edición sin depender de la columna videoProveedor.
const proveedorDeEnlace = (u: string): "meet" | "teams" | "otro" => {
  try {
    const h = new URL(u).host.toLowerCase();
    if (h === "meet.google.com") return "meet";
    if (h === "teams.live.com" || h === "teams.microsoft.com" || h.endsWith(".teams.microsoft.com")) return "teams";
  } catch { /* no es URL → "otro" (el caller ya filtra) */ }
  return "otro";
};

function LogoMeet({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#00832d" d="M13.5 12l3 3.4 4 2.6.7-6-.7-5.8-4.1 2.3z" />
      <path fill="#0066da" d="M0 16.6v4.1c0 .9.8 1.7 1.7 1.7h4.1l.9-3.1-.9-2.7-2.9-.9z" />
      <path fill="#e94235" d="M5.8 1.6L0 7.4l3 .9 2.8-.9.9-2.8z" />
      <path fill="#2684fc" d="M5.8 7.4H0v9.2h5.8z" />
      <path fill="#00ac47" d="M22.9 4.1l-2.4 2v11.9l2.4 1.9c.6.5 1.1.1 1.1-.6V4.7c0-.7-.5-1.1-1.1-.6z" />
      <path fill="#00ac47" d="M13.5 12v4.6H5.8v5.8h10.9c.9 0 1.7-.8 1.7-1.7v-2.7z" />
      <path fill="#ffba00" d="M16.7 1.6H5.8v5.8h7.7V12l4.9-.1V3.3c0-.9-.8-1.7-1.7-1.7z" />
    </svg>
  );
}
function LogoTeams({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="17.5" cy="6.2" r="2.4" fill="#7b83eb" />
      <path fill="#7b83eb" d="M21.6 9.6h-5.2c-.6 0-1 .4-1 1v5.6c0 2.2 1.4 3.9 3.6 3.9s3.6-1.7 3.6-3.9v-5.6c0-.6-.4-1-1-1z" />
      <circle cx="10.2" cy="5" r="3" fill="#5059c9" />
      <path fill="#5059c9" d="M14.6 9.6H4.1c-.6 0-1.1.5-1.1 1.1v6.2c0 3 2.1 5.5 5.3 5.5s5.3-2.5 5.3-5.5v-6.2c0-.6-.4-1.1-1-1.1z" />
      <rect x="1.5" y="7.5" width="11" height="11" rx="1.6" fill="#4b53bc" />
      <path fill="#fff" d="M9.6 10.6H8v5h-1.9v-5H4.5V9h5.1z" />
    </svg>
  );
}

// Modal para crear o EDITAR una CITA PREVIA (consulta). El gestor escribe el nombre: si
// coincide con un cliente existente puede seleccionarlo (rellena email/teléfono y la
// vincula), o deja un nombre libre (prospecto). Fecha obligatoria; aviso por email opcional.
// Con `citaId` entra en modo edición (carga la cita y hace PUT en vez de POST).
export function NuevaCitaModal({ clientes, onClose, citaId }: { clientes: ClienteMin[]; onClose: () => void; citaId?: string }) {
  const t = useT();
  const router = useRouter();
  const edicion = Boolean(citaId);
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [duracion, setDuracion] = useState(30);
  const [precio, setPrecio] = useState("");
  const [lugar, setLugar] = useState("");
  // Videollamada: lugar forzado a «Videollamada» (solo lectura). Dos modos:
  //   auto   — Aproba crea la reunión de Google Meet al guardar (workspace conectado);
  //   manual — el gestor pega el enlace de cualquier herramienta.
  const [esVideo, setEsVideo] = useState(false);
  const [modo, setModo] = useState<"auto" | "manual">("manual");
  const [videoEnlace, setVideoEnlace] = useState("");
  // Estado de la integración Google (se consulta al marcar la casilla, una sola vez).
  const [gcal, setGcal] = useState<{ configurado: boolean; conectado: boolean; caducada: boolean } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [notificar, setNotificar] = useState(!citaId); // crear: marcado; editar: opt-in (sin parpadeo)
  const [foco, setFoco] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modo edición: carga la cita y rellena el formulario UNA sola vez (depende solo de
  // citaId). IMPORTANTE: `t` NO debe estar en las dependencias — useT() devuelve una
  // función nueva en cada render, así que con `t` aquí el efecto se re-ejecutaría en cada
  // pulsación, re-haría el GET y machacaría lo que el usuario acaba de escribir. La
  // bandera `vivo` descarta respuestas obsoletas (cierre/reapertura rápida).
  useEffect(() => {
    if (!citaId) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/citas-previas?id=${encodeURIComponent(citaId)}`);
        const c = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) throw new Error(c.error);
        setNombre(c.nombre ?? ""); setClienteId(c.clienteId ?? null);
        setEmail(c.email ?? ""); setTelefono(c.telefono ?? "");
        setFecha(c.fecha ?? ""); setHora(c.hora ?? "");
        setDuracion(typeof c.duracion === "number" ? c.duracion : 30);
        setPrecio(c.precio != null ? String(c.precio) : "");
        setLugar(c.lugar ?? ""); setMotivo(c.motivo ?? ""); setNotas(c.notas ?? "");
        // Edición: siempre modo manual con el enlace existente (predecible; elegir
        // «auto» de nuevo crearía una reunión NUEVA, cosa que rara vez se quiere).
        // Doble señal: el proveedor guardado o el lugar «Videollamada» (una cita
        // marcada como videollamada SIN enlace debe reabrirse con la casilla puesta).
        setEsVideo(Boolean(c.videoProveedor) || c.lugar === "Videollamada");
        setModo("manual");
        setVideoEnlace(c.videoEnlace ?? "");
        setNotificar(false); // en edición, avisar al cliente es opt-in
      } catch { if (vivo) setError(t("No se pudo cargar la cita.")); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citaId]);

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

  // Al marcar la casilla, consultar UNA vez la integración Google; si está conectada
  // y es una cita nueva, proponer el modo automático por defecto.
  useEffect(() => {
    if (!esVideo || gcal) return;
    let vivo = true;
    fetch("/api/integraciones/google")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        const st = { configurado: Boolean(d?.configurado), conectado: Boolean(d?.conectado), caducada: Boolean(d?.caducada) };
        setGcal(st);
        if (st.conectado && !citaId) setModo("auto");
      })
      .catch(() => { if (vivo) setGcal({ configurado: false, conectado: false, caducada: false }); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esVideo]);

  // Videollamada → email y hora obligatorios. El ENLACE es opcional: se puede guardar
  // la cita como videollamada y añadirlo más tarde (pedido de Matthias: no bloquear al
  // gestor). Solo bloquea si escribió algo que no es una URL válida.
  const enlaceVacio = videoEnlace.trim() === "";
  const enlaceOk = ENLACE_HTTPS.test(videoEnlace.trim());
  const faltaVideo = esVideo && (!email.trim() || !hora || (modo === "manual" && !enlaceVacio && !enlaceOk));

  async function crear() {
    setBusy(true); setError(null);
    try {
      const notif = notificar && Boolean(email.trim());
      const datos = {
        clienteId, nombre, email, telefono, fecha, hora, duracion,
        precio: precio.trim() ? Number(precio) : undefined,
        lugar: esVideo ? "Videollamada" : lugar,
        motivo, notas,
        videoModo: esVideo ? modo : null,
        videoEnlace: esVideo && modo === "manual" ? videoEnlace.trim() : null,
      };
      const res = await fetch("/api/citas-previas", {
        method: edicion ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edicion ? { id: citaId, ...datos, notificar: notif } : { ...datos, notificar: notif }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar la cita."));
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar la cita."));
    } finally { setBusy(false); }
  }

  const fld = "w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="mt-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">{edicion ? t("Editar cita") : t("Nueva cita")}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label={t("Cerrar")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Edición de una videollamada con enlace → botón GRANDE para unirse, arriba del
            todo (pedido de Matthias): el caso «me conecto a la reunión de ya» no debe
            obligar a buscar el enlace entre los campos. Sigue el valor ACTUAL del campo,
            así también refleja un enlace recién corregido. */}
        {edicion && ENLACE_HTTPS.test(videoEnlace.trim()) && (
          <a
            href={videoEnlace.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
            {proveedorDeEnlace(videoEnlace.trim()) === "meet"
              ? t("Unirse a la videollamada (Google Meet)")
              : proveedorDeEnlace(videoEnlace.trim()) === "teams"
                ? t("Unirse a la videollamada (Microsoft Teams)")
                : t("Unirse a la videollamada")}
            <svg className="h-3.5 w-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
          </a>
        )}

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
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Email")} {esVideo && <span className="text-amber-500">*</span>}</label>
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
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Hora")} {esVideo && <span className="text-amber-500">*</span>}</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={fld} />
          </div>

          <div>
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Duración")}</label>
            <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className={`${fld} bg-white`}>
              {!PRESETS_DURACION.includes(duracion) && <option value={duracion}>{duracion} min</option>}
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1 h</option>
              <option value={90}>1 h 30</option>
              <option value={120}>2 h</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Precio (€)")}</label>
            <input type="number" min={0} step={5} value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder={t("Opcional")} className={fld} />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Lugar")}</label>
            <input
              value={esVideo ? t("Videollamada") : lugar}
              onChange={(e) => setLugar(e.target.value)}
              readOnly={esVideo}
              placeholder={t("Oficina, dirección…")}
              className={`${fld} ${esVideo ? "bg-slate-50 text-slate-500" : ""}`}
            />
          </div>

          {/* ── Videollamada: proveedor con logo + enlace de la reunión ── */}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={esVideo} onChange={(e) => setEsVideo(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
              {t("Videollamada")}
            </label>
            {esVideo && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {/* Con Google conectado: elegir entre crear el Meet automáticamente o pegar
                    un enlace. Sin conexión: solo manual (con invitación a conectar). */}
                {gcal?.conectado && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setModo("auto")}
                      aria-pressed={modo === "auto"}
                      className={`flex items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm font-semibold transition ${modo === "auto" ? "border-aproba-600 ring-2 ring-aproba-100 text-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
                    >
                      <LogoMeet />
                      {t("Crear Google Meet automáticamente")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModo("manual")}
                      aria-pressed={modo === "manual"}
                      className={`flex items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm font-semibold transition ${modo === "manual" ? "border-aproba-600 ring-2 ring-aproba-100 text-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
                    >
                      {t("Pegar un enlace")}
                    </button>
                  </div>
                )}

                {modo === "auto" && gcal?.conectado ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    {t("Al guardar se creará la reunión de Google Meet y se añadirá a tu calendario. El cliente recibirá el enlace en su invitación.")}
                  </p>
                ) : (
                  <div className={gcal?.conectado ? "mt-3" : ""}>
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {t("Enlace de la videollamada")} <span className="normal-case text-slate-300">({t("opcional")})</span>
                    </label>
                    <input
                      value={videoEnlace}
                      onChange={(e) => setVideoEnlace(e.target.value)}
                      placeholder="https://meet.google.com/… · https://teams.live.com/… · https://zoom.us/…"
                      className={`${fld} bg-white`}
                    />
                    {videoEnlace.trim() && !enlaceOk && (
                      <p className="mt-1 text-[11px] text-red-600">{t("Pega el enlace https:// de la reunión, o déjalo vacío.")}</p>
                    )}
                    {enlaceVacio && (
                      <p className="mt-1 text-[11px] text-slate-400">{t("Puedes guardar la cita sin enlace y añadirlo más tarde editándola. El cliente recibirá la cita como videollamada, sin enlace.")}</p>
                    )}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                      {t("Crear la reunión en:")}
                      <a href={CREAR_REUNION.meet} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700">
                        <LogoMeet className="h-3.5 w-3.5" /> Google Meet ↗
                      </a>
                      <a href={CREAR_REUNION.teams} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700">
                        <LogoTeams className="h-3.5 w-3.5" /> Microsoft Teams ↗
                      </a>
                      <span className="text-slate-400">{t("o pega el de cualquier otra herramienta (Zoom…).")}</span>
                    </p>
                    {gcal && gcal.configurado && !gcal.conectado && (
                      gcal.caducada ? (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700">
                          {t("La conexión con Google ha caducado: vuelve a conectarla en")} <a href="/app/ajustes" className="font-semibold underline">{t("Ajustes")}</a> {t("para volver a crear reuniones automáticamente.")}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                          {t("Conecta tu cuenta de Google en")} <a href="/app/ajustes" className="font-semibold text-aproba-700 hover:underline">{t("Ajustes")}</a> {t("para crear reuniones de Meet automáticamente.")}
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
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
          {edicion ? t("Avisar al cliente del cambio por email") : t("Enviar confirmación por email al cliente")}
        </label>
        {edicion && !email.trim() && <p className="mt-1 text-[11px] text-slate-400">{t("Añade un email para poder avisar al cliente.")}</p>}

        {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">{t("Cancelar")}</button>
          <button onClick={crear} disabled={busy || !nombre.trim() || !fecha || faltaVideo} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
            {busy ? t("Guardando…") : edicion ? t("Guardar cambios") : t("Crear cita")}
          </button>
        </div>
      </div>
    </div>
  );
}
