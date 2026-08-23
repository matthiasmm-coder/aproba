// Tras cada deploy, una pestaña abierta con el build ANTERIOR pide chunks JS que ya
// no existen: el clic siguiente casca con «Algo ha fallado» sin que haya ningún bug
// (le pasó a Matthias el 23/08 justo tras un deploy). Ese error NO se enseña: se
// recarga la página una vez — la recarga trae el build nuevo y todo sigue.
export function esChunkPerimido(error: { name?: string; message?: string }): boolean {
  const m = `${error.name ?? ""} ${error.message ?? ""}`;
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|is not a valid JavaScript MIME type/i.test(m);
}

// true = recarga lanzada (enseñar «Actualizando…», no el error). El sello temporal
// evita el bucle si el reload no arregla nada (p. ej. sin red): un solo intento por
// medio minuto.
export function recargarPorChunkPerimido(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const CLAVE = "aproba.reload-chunk";
    const ultimo = Number(sessionStorage.getItem(CLAVE) ?? 0);
    if (Date.now() - ultimo < 30_000) return false;
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch { /* sessionStorage bloqueado → recarga igualmente, sin guarda */ }
  window.location.reload();
  return true;
}
