"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Oficina } from "@/lib/data/oficinas";
import { OFICINAS_INCLUIDAS, PRECIO_OFICINA_EXTRA, precioOficinaExtra } from "@/lib/oficinas";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// MULTI-OFICINA (Business) — sedes del mismo despacho + reparto del equipo.
// Todo lo demás sigue compartido: suscripción, cuota, servicios, hoja de encargo.
// La oficina de un cliente se elige en su ficha; el expediente la hereda.

const inp =
  "w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

async function callOficinas(payload: Record<string, unknown>) {
  const res = await fetch("/api/oficinas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as Record<string, unknown> };
}

export function OficinasManager({
  inicial,
  plan,
  puedeEditar,
}: {
  inicial: Oficina[];
  plan: string;
  puedeEditar: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [oficinas, setOficinas] = useState<Oficina[]>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const esBusiness = plan === "BUSINESS";

  // Création
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [creando, setCreando] = useState(false);

  // Édition en ligne
  const [editando, setEditando] = useState<string | null>(null);
  const [draft, setDraft] = useState({ nombre: "", direccion: "", telefono: "" });

  const extra = precioOficinaExtra(oficinas.length);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreando(true);
    const { ok, data } = await callOficinas({ action: "crear", nombre, direccion, telefono });
    setCreando(false);
    if (!ok) { setError(String(data.error ?? t("No se pudo crear la oficina."))); return; }
    setOficinas((prev) => [...prev, data.oficina as Oficina]);
    setNombre(""); setDireccion(""); setTelefono("");
    router.refresh(); // 1→2 oficinas: el selector de sede aparece en la lista del equipo, arriba
  }

  async function guardar(o: Oficina) {
    const limpio = draft.nombre.trim().replace(/\s+/g, " ");
    if (limpio.length < 2) { setEditando(null); return; }
    setError(null);
    setBusy(o.id);
    const { ok, data } = await callOficinas({ action: "editar", oficinaId: o.id, ...draft, nombre: limpio });
    setBusy(null);
    if (!ok) { setError(String(data.error ?? t("No se pudo guardar."))); return; }
    setOficinas((prev) => prev.map((x) => (x.id === o.id
      ? { ...x, nombre: limpio, direccion: draft.direccion.trim() || null, telefono: draft.telefono.trim() || null }
      : x)));
    setEditando(null);
  }

  async function eliminar(o: Oficina) {
    if (!(await confirmar({
      mensaje: `${t("¿Eliminar la oficina")} «${o.nombre}»?`,
      peligro: true,
      confirmarLabel: t("Eliminar"),
    }))) return;
    setError(null);
    setBusy(o.id);
    const { ok, data } = await callOficinas({ action: "eliminar", oficinaId: o.id });
    setBusy(null);
    if (!ok) { setError(String(data.error ?? t("No se pudo eliminar."))); return; }
    setOficinas((prev) => prev.filter((x) => x.id !== o.id));
    router.refresh(); // los miembros que estaban en esa sede vuelven a «Todas» en la lista de arriba
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        {esBusiness
          ? t("Si tu despacho tiene varias sedes, cada cliente y cada expediente pertenece a una. Los servicios, la facturación y la suscripción siguen siendo comunes.")
          : t("Para despachos con varias sedes: cada cliente y cada expediente pertenece a una oficina.")}
      </p>

      {!esBusiness && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          {t("Multi-oficina está incluido en el plan Business")} ({OFICINAS_INCLUIDAS} {t("oficinas incluidas")}
          {t(", después")} {PRECIO_OFICINA_EXTRA} {t("€/mes por oficina adicional")}).{" "}
          <a href="/app/ajustes?abrir=plan" className="font-semibold underline underline-offset-2">{t("Ver planes")}</a>
        </div>
      )}

      {/* Estado inicial: un despacho Business con 0 oficinas solo veía el formulario
          desnudo — nada decía que ESTO es el multi-oficina, ni cuántas entran en el plan.
          El cupo (2 incluidas, +50 €/mes después) solo aparecía como reclamo a los que NO
          son Business o como aviso al pasar de 2: justo el administrador que va a crearlas
          no lo veía nunca. */}
      {esBusiness && oficinas.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3.5 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">{t("Aún no has creado ninguna oficina")}</p>
          <p className="mt-1">
            {t("Crea una por cada sede. Después asigna a cada persona la suya: verá solo el trabajo de su oficina, y quien esté en «Todas» las verá todas.")}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {t("Tu plan Business incluye")} {OFICINAS_INCLUIDAS} {t("oficinas")} · +{PRECIO_OFICINA_EXTRA} {t("€/mes por oficina adicional")}
          </p>
        </div>
      )}

      {/* ── Liste des oficinas ────────────────────────────────────────────
          Multi-oficina es EXCLUSIVO de Business: en Starter/Pro la noción no
          existe para el usuario. Toda gestoría tiene sin embargo una oficina en
          base (la propia gestoría, creada por el trigger inicial) — enseñarla
          hacía aparecer una «lista de oficinas» a quien no tiene la función.
          Excepción deliberada: si un despacho BAJÓ de plan conservando varias
          sedes, se siguen enseñando (en lectura) — esconder dónde están sus
          clientes sería peor que enseñar una función que ya no puede editar. */}
      {(esBusiness || oficinas.length > 1) && oficinas.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {oficinas.map((o) => (
            <li key={o.id} className="bg-white px-4 py-3">
              {editando === o.id ? (
                <div className="space-y-2">
                  <input autoFocus value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") guardar(o); if (e.key === "Escape") setEditando(null); }}
                    maxLength={80} placeholder={t("Nombre de la oficina")} className={inp} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input value={draft.direccion} onChange={(e) => setDraft({ ...draft, direccion: e.target.value })}
                      maxLength={200} placeholder={t("Dirección (opcional)")} className={inp} />
                    <input value={draft.telefono} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })}
                      maxLength={40} placeholder={t("Teléfono (opcional)")} className={inp} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => guardar(o)} disabled={busy === o.id}
                      className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
                      {busy === o.id ? "…" : t("Guardar")}
                    </button>
                    <button type="button" onClick={() => setEditando(null)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400">
                      {t("Cancelar")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{o.nombre}</p>
                    <p className="truncate text-xs text-slate-400">
                      {[o.direccion, o.telefono].filter(Boolean).join(" · ") || t("Sin dirección")}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {o.clientes} {o.clientes === 1 ? t("cliente") : t("clientes")} · {o.miembros} {o.miembros === 1 ? t("usuario") : t("usuarios")}
                  </span>
                  {puedeEditar && (
                    <div className="flex items-center gap-1">
                      <button type="button" title={t("Editar")} aria-label={t("Editar")}
                        onClick={() => { setDraft({ nombre: o.nombre, direccion: o.direccion ?? "", telefono: o.telefono ?? "" }); setEditando(o.id); setError(null); }}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-aproba-700">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                      </button>
                      <button type="button" title={t("Eliminar")} aria-label={t("Eliminar")}
                        onClick={() => eliminar(o)} disabled={busy === o.id}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {esBusiness && oficinas.length > 0 && !extra && (
        <p className="text-xs text-slate-400">
          {oficinas.length} {t("de")} {OFICINAS_INCLUIDAS} {t("oficinas incluidas en tu plan Business")} · +{PRECIO_OFICINA_EXTRA} {t("€/mes a partir de la siguiente")}
        </p>
      )}

      {extra && (
        <p className="rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-800">
          {t("Tienes")} {oficinas.length} {t("oficinas")}: {OFICINAS_INCLUIDAS} {t("incluidas en Business y")} {extra.extras}{" "}
          {extra.extras === 1 ? t("adicional") : t("adicionales")} (+{extra.euros} {t("€/mes")} + IVA). {t("Te contactaremos para ajustar tu suscripción.")}
        </p>
      )}

      {/* ── Créer ─────────────────────────────────────────────────────── */}
      {puedeEditar && esBusiness && (
        <form onSubmit={crear} className="rounded-xl border border-slate-200 bg-cream-50/60 p-4">
          <h4 className="text-sm font-semibold text-slate-800">{t("Añadir una oficina")}</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80}
              placeholder={t("Nombre (ej. Gran Via)")} className={inp} />
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={200}
              placeholder={t("Dirección (opcional)")} className={inp} />
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={40}
              placeholder={t("Teléfono (opcional)")} className={inp} />
          </div>
          {/* Conteneur centreur, pas `block mx-auto` sur le bouton : un <button> en
              display:block prend toute la largeur disponible au lieu de rester à sa taille. */}
          <div className="mt-3 flex justify-center">
            <button type="submit" disabled={creando}
              className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
              {creando ? t("Añadiendo…") : t("Añadir oficina")}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
