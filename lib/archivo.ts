// Suivi des expedientes archivés (terminés ou abandonnés).
// Fuente de verdad: SERVIDOR (Expediente.archivadoAt — igual para todo el equipo).
// localStorage queda como caché optimista y repli si la migración falta.

const KEY = "aproba.archivados.v1";

export function loadArchivados(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return new Set<string>(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

export function saveArchivados(s: Set<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

// Escribe el estado en servidor (y en el caché local para respuesta inmediata).
// Devuelve false si el servidor no pudo persistir (sin migración / red) — el caché
// local ya quedó actualizado, así el gesto nunca «no hace nada».
export async function setArchivadoServidor(id: string, archivado: boolean): Promise<boolean> {
  const s = loadArchivados();
  if (archivado) s.add(id); else s.delete(id);
  saveArchivados(s);
  try {
    const res = await fetch(`/api/expedientes/${id}/archivar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archivado }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
