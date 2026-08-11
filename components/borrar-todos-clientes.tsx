"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// «Zona peligrosa» de la lista de clientes: vaciar la agenda de golpe tras una
// importación fallida. Solo se pinta para administradores (y el servidor lo vuelve
// a comprobar: la UI nunca es la autorización).
//
// Confirmación ESCRITA, no un botón rojo más: un clic de más no debe poder borrar
// 200 fichas. Y se dice ANTES cuántas se van y cuántas quedan protegidas, con el
// motivo — un borrado que sorprende es un borrado que se recuerda mal.
export function BorrarTodosClientes({ borrables, conExpedientes, enFamilia }: {
  borrables: number;
  conExpedientes: number;
  enFamilia: number;
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<number | null>(null);

  const protegidos = conExpedientes + enFamilia;
  if (borrables === 0 && protegidos === 0) return null;

  async function borrar() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/clientes/borrar-todos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacion: "ELIMINAR", esperados: borrables }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudieron eliminar los clientes."));
      setHecho(d.eliminados ?? 0);
      setAbierto(false); setTexto("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudieron eliminar los clientes."));
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-10 border-t border-slate-200 pt-4">
      {hecho !== null && (
        <p role="status" className="mb-3 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-800">
          {hecho === 1 ? t("1 cliente eliminado.") : t("{n} clientes eliminados.").replace("{n}", String(hecho))}
          {protegidos > 0 && " " + t("Los que tenían expedientes o familia siguen en su sitio.")}
        </p>
      )}

      {!abierto ? (
        <button
          onClick={() => { setAbierto(true); setError(null); setHecho(null); }}
          className="text-xs font-medium text-slate-400 transition hover:text-red-600"
        >
          {t("Eliminar todos los clientes")}
        </button>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <h3 className="text-sm font-semibold text-red-800">{t("Eliminar todos los clientes")}</h3>
          <p className="mt-1 text-sm text-red-700">
            {(borrables === 1
              ? t("Se eliminará 1 ficha de cliente, con sus documentos sueltos y sus avisos de caducidad. No se puede deshacer.")
              : t("Se eliminarán {n} fichas de cliente, con sus documentos sueltos y sus avisos de caducidad. No se puede deshacer.").replace("{n}", String(borrables)))}
          </p>
          {protegidos > 0 && (
            <p className="mt-2 text-xs text-red-700/90">
              {t("Quedan fuera {n}:").replace("{n}", String(protegidos))}{" "}
              {conExpedientes > 0 && t("{n} con expedientes").replace("{n}", String(conExpedientes))}
              {conExpedientes > 0 && enFamilia > 0 && " · "}
              {enFamilia > 0 && t("{n} en una familia").replace("{n}", String(enFamilia))}
              {". "}
              {t("Las facturas no se tocan nunca.")}
            </p>
          )}

          <label className="mt-3 block text-xs font-medium text-red-800">
            {t("Escribe ELIMINAR para confirmar")}
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-48 rounded-lg border border-red-300 bg-white px-3 py-2 text-[16px] uppercase tracking-widest outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 sm:text-sm"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={borrar}
              disabled={busy || texto.trim().toUpperCase() !== "ELIMINAR" || borrables === 0}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:bg-slate-300"
            >
              {busy ? t("Eliminando…") : borrables === 1 ? t("Eliminar 1 cliente") : t("Eliminar {n} clientes").replace("{n}", String(borrables))}
            </button>
            <button
              onClick={() => { setAbierto(false); setTexto(""); setError(null); }}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
            >
              {t("Cancelar")}
            </button>
          </div>
          {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
