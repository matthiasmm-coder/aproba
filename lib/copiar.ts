// Copia al portapapeles a prueba de navegador. `navigator.clipboard` falla más de lo
// que parece: contexto no seguro, documento sin foco, permisos denegados, o la API
// directamente ausente (algunos navegadores endurecidos). Y `navigator.clipboard?.
// writeText(x).then(ok)` sin rechazo deja al usuario SIN NINGUNA señal: el botón
// parece muerto. De ahí este helper — devuelve false en vez de lanzar, para que la UI
// pueda avisar y ofrecer el texto en claro como salida manual.
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* cae al método antiguo */
  }
  // Repli execCommand: obsoleto pero sigue funcionando donde la Clipboard API está
  // bloqueada, que es justo el caso que queremos cubrir.
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
