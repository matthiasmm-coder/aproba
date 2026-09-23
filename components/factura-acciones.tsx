"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { CobroFacturaModal } from "@/components/cobro-factura-modal";
import type { FacturaEstado } from "@/lib/facturas";

// Acciones por factura: anular (deja sin efecto SIN romper la numeración — la vía correcta
// para una factura emitida por error), archivar/restaurar (no destructivo) y eliminar
// (definitivo, solo admin). Reutilizado en la tabla de la lista y en la ficha de la factura.
// Anular solo aparece en EMITIDA/VENCIDA: un borrador se borra, una pagada se rectifica.
export function FacturaAcciones({
  id, numero, estado, archivada, esAdmin, onDone, conEditar = false, enBarra = false, esRectificativa = false, rectificadaPor = null, metodoPago = null,
}: {
  id: string;
  numero: string;
  estado: FacturaEstado;
  archivada: boolean;
  esAdmin: boolean;
  // Rectificativas (21/09/2026): una rectificativa no se rectifica, y una factura ya
  // rectificada tampoco (el índice único lo impide; aquí no se ofrece el botón).
  esRectificativa?: boolean;
  rectificadaPor?: { id: string; numero: string } | null;
  metodoPago?: string | null; // para avisar si el cobro se hizo con tarjeta
  onDone?: () => void; // p.ej. redirigir tras borrar desde la ficha
  // «Editar» dentro de la fila (lista de Facturas). En la ficha de la factura NO: allí el
  // botón Editar vive en la cabecera del documento (evita dos botones iguales).
  conEditar?: boolean;
  // `enBarra`: dentro de la barra de acciones de la ficha de la factura, donde TODOS los
  // botones miden lo mismo (h-10, la altura de «Editar»). En la fila de la lista siguen
  // siendo iconos pequeños, si no la tabla se estiraría.
  enBarra?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<null | "archivar" | "borrar" | "anular" | "cobrar" | "descobrar" | "rectificar">(null);
  const [error, setError] = useState<string | null>(null);
  // Editar desde la LISTA (petición Luis y Marta, 17/09): abrían una factura emitida a una
  // empresa y solo podían archivarla o eliminarla. Una emitida se retoca; una PAGADA no
  // (el dinero ya entró) y una ANULADA tampoco. El servidor vuelve a validarlo.
  const [editando, setEditando] = useState(false);
  // Una RECTIFICATIVA no se edita (auditoría 23/09): cambiar el abono rompería «original +
  // rectificativa = 0», que es su razón de ser. Si está mal, se anula y se emite otra.
  const editable = conEditar && !archivada && !esRectificativa && estado !== "PAGADA" && estado !== "ANULADA";
  // Icono: cuadrado de 40 px en la barra, botón pequeño en la fila de la lista.
  const ico = enBarra ? "flex h-10 w-10 items-center justify-center rounded-lg" : "rounded p-1.5";

  async function archivar() {
    setBusy("archivar"); setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}/archivar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivado: !archivada }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo archivar la factura."));
      router.refresh();
      setBusy(null); // los sub-componentes ya no se remontan: hay que resetear a mano
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo archivar la factura."));
      setBusy(null);
    }
  }

  async function anular() {
    const mensaje = t("Vas a anular la factura {n}. Dejará de contar como facturada y no se podrá cobrar, pero se conserva con su número (la numeración correlativa no se rompe). ¿Continuar?").replace("{n}", numero);
    if (!(await confirmar({ mensaje, titulo: t("Anular factura"), confirmarLabel: t("Anular"), peligro: true }))) return;
    setBusy("anular"); setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}/anular`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo anular la factura."));
      router.refresh();
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo anular la factura."));
      setBusy(null);
    }
  }

  async function borrar() {
    // Una COBRADA no se elimina (el servidor lo niega). Antes se pedía confirmar un borrado
    // «definitivo» para luego contestar que no: era el callejón sin salida del que se quejó
    // Luis («no permite eliminarlas»). Ahora se explica por qué y se ofrece la salida buena.
    if (estado === "PAGADA") {
      const deshacer = await confirmar({
        titulo: t("Esta factura está cobrada"),
        mensaje: t("Una factura cobrada no se puede eliminar: su número ya forma parte de la serie y el cobro consta. Si la marcaste como cobrada por error, deshaz el cobro y volverá a pendiente con el mismo número. Si lo que está mal es la factura, emite una rectificativa."),
        confirmarLabel: t("Deshacer el cobro"),
      });
      if (deshacer) await descobrar(false);
      return;
    }
    // Aviso reforzado para facturas ya emitidas: rompe la numeración correlativa.
    const emitida = estado !== "BORRADOR";
    const mensaje = emitida
      ? t("Vas a eliminar la factura {n} de forma definitiva. Es una factura ya emitida: borrarla rompe la numeración correlativa (lo habitual es emitir una rectificativa). ¿Continuar?").replace("{n}", numero)
      : t("Vas a eliminar el borrador de factura {n} de forma definitiva. ¿Continuar?").replace("{n}", numero);
    if (!(await confirmar({ mensaje, titulo: t("Eliminar factura"), confirmarLabel: t("Eliminar"), peligro: true }))) return;
    setBusy("borrar"); setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo eliminar la factura."));
      if (onDone) { onDone(); return; } // navega fuera: no reseteamos (se desmonta)
      router.refresh();
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar la factura."));
      setBusy(null);
    }
  }

  // «Cobrada» desde la lista (16/09/2026): Juan tenía 39 emitidas y 2 pagadas porque cobra
  // fuera de la plataforma y nunca lo marcaba — «cobrado» y «pendiente» mentían. Un clic,
  // método transferencia por defecto (el detalle permite entregas con su método).
  async function cobrada() {
    if (!(await confirmar(t("¿Marcar la factura {n} como cobrada? Se registra el cobro por transferencia y, si va ligada a un expediente, el cliente recibe la confirmación por email.").replace("{n}", numero)))) return;
    setBusy("cobrar"); setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}/pagada`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metodo: "TRANSFERENCIA" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo marcar como cobrada."));
      // Solo refrescar: `onDone` es para salir tras BORRAR (la factura ya no existe).
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo marcar como cobrada."));
    } finally { setBusy(null); }
  }

  // DESHACER EL COBRO (Luis, 21/09/2026): marcar «pagada» por error dejaba la factura en
  // un callejón sin salida. No es un error contable — la factura se emitió bien y solo el
  // estado del pago es falso —, así que vuelve a pendiente conservando su número.
  async function descobrar(preguntar = true) {
    const aviso = metodoPago === "TARJETA"
      ? t("Si el cobro se hizo con tarjeta en la plataforma, el dinero ya está en tu cuenta: deshacerlo aquí NO lo devuelve. ")
      : "";
    if (preguntar && !(await confirmar({
      titulo: t("Deshacer el cobro"),
      mensaje: aviso + t("La factura {n} volverá a estar pendiente de cobro. Conserva su número y su fecha; queda constancia en el historial. ¿Continuar?").replace("{n}", numero),
      confirmarLabel: t("Deshacer el cobro"),
    }))) return;
    setBusy("descobrar"); setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}/pagada`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo deshacer el cobro."));
      // ⚠️ Antes llamaba también a `onDone`, que en la ficha es «volver a la lista tras
      // borrar»: esa navegación y el refresco se anulaban y la ficha se quedaba en «Pagada»
      // aunque el cobro SÍ se había deshecho (auditoría 23/09). Aquí solo se refresca.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo deshacer el cobro."));
    } finally { setBusy(null); }
  }

  // RECTIFICATIVA: la vía legal para corregir una factura ya emitida (RD 1619/2012,
  // art. 15). La original se conserva intacta; la nueva lleva los importes en negativo.
  async function rectificar() {
    if (!(await confirmar({
      titulo: t("Emitir rectificativa"),
      mensaje: t("Se emitirá una factura rectificativa de la {n}, con su propio número (serie R) y los importes en negativo. La factura original se conserva tal cual. ¿Continuar?").replace("{n}", numero),
      confirmarLabel: t("Emitir rectificativa"),
    }))) return;
    setBusy("rectificar"); setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}/rectificar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo emitir la rectificativa."));
      router.refresh();
      if (d.id) router.push(`/app/facturas/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo emitir la rectificativa."));
    } finally { setBusy(null); }
  }

  // En la barra de la ficha, «Deshacer el cobro» y «Emitir rectificativa» van con TEXTO
  // (auditoría 23/09): eran dos iconos grises junto a archivar y borrar, y son justo las
  // dos salidas que pidió Luis. En la fila de la lista siguen siendo iconos (la tabla).
  const BTN_TEXTO = "inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-40";
  const puedeRectificar = !esRectificativa && !rectificadaPor && estado !== "BORRADOR" && estado !== "ANULADA" && !archivada;

  return (
    <div className={`flex items-center justify-end ${enBarra ? "gap-2" : "gap-1"}`}>
      {editable && (
        <button
          onClick={() => setEditando(true)}
          disabled={busy !== null}
          title={t("Editar")}
          aria-label={t("Editar factura {n}").replace("{n}", numero)}
          className={`${ico} text-slate-300 transition hover:bg-aproba-50 hover:text-aproba-700 disabled:opacity-40`}
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      )}
      {/* «Cobrada» es el atajo de la LISTA. En la ficha ya está «Marcar como pagada», que
          además pregunta el método: dos botones para lo mismo solo estorbaban. */}
      {!enBarra && (estado === "EMITIDA" || estado === "VENCIDA") && !archivada && (
        <button
          onClick={cobrada}
          disabled={busy !== null}
          aria-label={t("Marcar la factura {n} como cobrada").replace("{n}", numero)}
          className={`${enBarra ? "inline-flex h-10 items-center rounded-lg px-3 text-sm" : "mr-1 rounded-md px-2 py-1 text-xs"} border border-aproba-200 bg-aproba-50 font-semibold text-aproba-700 transition hover:border-aproba-300 disabled:opacity-40`}
        >
          {busy === "cobrar" ? "…" : t("Cobrada")}
        </button>
      )}
      {/* Una pagada por error vuelve a pendiente: es lo que faltaba para no tener que
          borrar una factura emitida (petición de Luis, 21/09/2026). */}
      {estado === "PAGADA" && !archivada && (
        <button
          onClick={() => void descobrar()}
          disabled={busy !== null}
          title={t("Deshacer el cobro")}
          aria-label={t("Deshacer el cobro de la factura {n}").replace("{n}", numero)}
          className={enBarra ? BTN_TEXTO : `${ico} text-slate-300 transition hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40`}
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
          {enBarra && <span>{t("Deshacer el cobro")}</span>}
        </button>
      )}
      {/* Rectificativa: la vía correcta para corregir una factura emitida. */}
      {puedeRectificar && (
        <button
          onClick={rectificar}
          disabled={busy !== null}
          title={t("Emitir rectificativa")}
          aria-label={t("Emitir una rectificativa de la factura {n}").replace("{n}", numero)}
          className={enBarra ? BTN_TEXTO : `${ico} text-slate-300 transition hover:bg-aproba-50 hover:text-aproba-700 disabled:opacity-40`}
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15h6" /></svg>
          {enBarra && <span>{t("Emitir rectificativa")}</span>}
        </button>
      )}
      {(estado === "EMITIDA" || estado === "VENCIDA") && (
        <button
          onClick={anular}
          disabled={busy !== null}
          title={t("Anular")}
          aria-label={t("Anular factura {n}").replace("{n}", numero)}
          className={`${ico} text-slate-300 transition hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40`}
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
        </button>
      )}
      <button
        onClick={archivar}
        disabled={busy !== null}
        title={archivada ? t("Restaurar") : t("Archivar")}
        aria-label={archivada ? t("Restaurar factura {n}").replace("{n}", numero) : t("Archivar factura {n}").replace("{n}", numero)}
        className={`${ico} text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40`}
      >
        {archivada ? (
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8" /></svg>
        ) : (
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>
        )}
      </button>
      {esAdmin && (
        <button
          onClick={borrar}
          disabled={busy !== null}
          title={t("Eliminar")}
          aria-label={t("Eliminar factura {n}").replace("{n}", numero)}
          className={`${ico} text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40`}
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      )}
      {error && <span role="alert" className="ml-1 max-w-[160px] text-right text-[11px] leading-tight text-red-600">{error}</span>}
      {editando && <CobroFacturaModal modo="editar" facturaId={id} onClose={() => { setEditando(false); router.refresh(); }} />}
    </div>
  );
}
