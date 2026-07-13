// Subida de un documento con progreso REAL (XHR) — compartido por el wizard /j y el
// seguimiento /s (antes duplicado: /j tenía barra, /s subía «a ciegas» con fetch).
//  • 0-45 %  : subida del archivo (señal real del navegador).
//  • 45-98 % : avance asintótico mientras la IA analiza (sin señal de progreso) — la
//              barra siempre se mueve, cada vez más despacio, y nunca se queda clavada.
//  • 100 %   : respuesta recibida. El servidor recibe el mismo multipart que antes.

export type RespuestaSubida = {
  ok: boolean;
  data: { estado?: string; campos?: { label: string; value: string }[]; alertas?: string[]; error?: string } | null;
};

export function subirConProgreso(opts: {
  form: Record<string, string>; // token, label, clienteId…
  file: File;
  onProgreso: (v: number) => void; // 0..100, monótono
  errorRed: string; // mensaje del reject en fallo de red (i18n del llamante)
  url?: string;
}): Promise<RespuestaSubida> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(opts.form)) fd.append(k, v);
    fd.append("file", opts.file);

    const xhr = new XMLHttpRequest();
    let creep: ReturnType<typeof setInterval> | null = null;
    let actual = 0;
    const subir = (v: number) => {
      actual = Math.max(actual, Math.min(100, v));
      opts.onProgreso(actual);
    };
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) subir(Math.round((ev.loaded / ev.total) * 45)); };
    xhr.upload.onload = () => {
      subir(45);
      creep = setInterval(() => { if (actual < 98) subir(actual + (98 - actual) * 0.045); }, 140);
    };
    const stop = () => { if (creep) { clearInterval(creep); creep = null; } };
    xhr.onload = () => {
      stop();
      subir(100);
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* respuesta no-JSON */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
    };
    xhr.onerror = () => { stop(); reject(new Error(opts.errorRed)); };
    xhr.open("POST", opts.url ?? "/api/portal/documentos");
    xhr.send(fd);
  });
}
