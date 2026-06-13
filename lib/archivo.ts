// Suivi des expedientes archivés (terminés ou abandonnés).
// Persisté en localStorage en attendant Supabase.

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
