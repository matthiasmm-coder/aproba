"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Sincronización de vuelta desde Mercurio: el gestor marca «he presentado» en el panel
// de la extensión (allí mismo, sin volver a buscar la tarjeta) y ESTE componente aplica
// la marca en cuanto abre cualquier página de Aproba — con su sesión, por la ruta normal
// de avanzar. Cero endpoints públicos, cero CORS, cero permisos nuevos de extensión:
// la cola viaja por chrome.storage y el relay de la extensión la entrega aquí.
//
// Por qué así (medición 22/08): la mitad final del ciclo no se usaba porque exigía
// VOLVER al producto a declarar lo que pasó fuera. El clic se queda donde ocurre la
// presentación; el producto se pone al día solo.
//
// El ack borra el elemento de la cola de la extensión. Se ackea también en 4xx
// (expediente de otro workspace, ya resuelto…): reintentarlo para siempre solo
// atascaría la cola. Sin red → sin ack → reintento en la próxima página.

export function MercurioSync() {
  const router = useRouter();
  const procesados = useRef<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    async function onMsg(ev: MessageEvent) {
      if (ev.source !== window || !vivo) return;
      const d = ev.data as { source?: string; type?: string; items?: { expedienteId?: string }[] };
      if (d?.source !== "aproba-mercurio-ext" || d?.type !== "presentado-pendiente" || !Array.isArray(d.items)) return;
      let algunCambio = false;
      for (const it of d.items) {
        const id = typeof it?.expedienteId === "string" ? it.expedienteId : "";
        if (!id || procesados.current.has(id)) continue;
        procesados.current.add(id);
        try {
          const res = await fetch(`/api/expedientes/${id}/avanzar`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accion: "presentar" }),
          });
          if (res.ok) algunCambio = true;
          if (res.ok || (res.status >= 400 && res.status < 500)) {
            window.postMessage({ source: "aproba-mercurio", type: "presentado-ack", expedienteId: id }, window.location.origin);
          } else {
            procesados.current.delete(id); // 5xx: se reintenta en la próxima página
          }
        } catch {
          procesados.current.delete(id); // sin red: ídem
        }
      }
      if (algunCambio) router.refresh();
    }
    window.addEventListener("message", onMsg);
    // Despierta al relay por si ya estaba cargado antes que nosotros.
    window.postMessage({ source: "aproba-mercurio", type: "ping" }, window.location.origin);
    return () => { vivo = false; window.removeEventListener("message", onMsg); };
  }, [router]);

  return null;
}
