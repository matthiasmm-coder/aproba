// GUÍA INTERACTIVA (05/09/2026): en vez de bloques de texto, un solo paso a la vez,
// señalado con una flecha sobre el elemento real de la pantalla. Módulo puro: decide QUÉ
// paso toca según el estado del despacho, la ruta y lo que ya se ha mirado; el componente
// (guia-activacion.tsx) lo pinta.
//
// UNA sola secuencia, sin fases ni idas y vueltas (Matthias, 05/09 noche: «todo de un bloque»):
//  1 abrir el ejemplo → 2 información → 3 documentos → 4 citas → 5 cobro (en la ficha, en
//  ese orden: los formularios van al final para no tener que volver) → 6 formularios
//  generados DE VERDAD (la descarga del EX-17 los registra) → 7 nuevo expediente para un
//  cliente nuevo (nombre y WhatsApp) → 8 enviarle el enlace → fin: ventana Aproba Despegue.
// Los pasos de «mirar» (2-5) se confirman con «Siguiente» y se recuerdan en el navegador;
// los demás se deducen de los hechos. Solo para cuentas nacidas con la guía (cuentaNueva).
import { cuentaNueva, type DatosActivacion } from "@/lib/activacion";
export { cuentaNueva, GUIA_DESDE } from "@/lib/activacion";

export type PasoGuia = {
  key: string;
  n: number;        // posición (1..TOTAL_PASOS)
  titulo: string;   // ≤ 6 palabras
  texto: string;    // UNA línea
  cta: string;      // etiqueta del botón ("" = sin botón)
  anclaje?: string; // data-guia del elemento a señalar en ESTA página
  anclajes?: string[]; // alternativas por orden: se señala el PRIMER data-guia presente
  textos?: Record<string, { titulo: string; texto: string }>; // título/texto según el anclaje señalado
  abrir?: string;   // id de sección plegable de la ficha que hay que abrir (evento abrir-seccion)
  ir?: string;      // destino del botón cuando el elemento no está en esta página
  avanza?: number;  // paso de «mirar»: el botón lo confirma y deja vistos = avanza
  termina?: boolean; // último paso: el botón cierra la guía y abre Aproba Despegue
};
// vistos: 2 información · 3 documentos · 4 citas · 5 cobro. enlaceVisto: ya vio cómo enviar
// el enlace (no hay hecho en base: copiar o abrir WhatsApp no dejan rastro).
export type TourEjemplo = { vistos: number; enlaceVisto?: boolean };
export const TOUR_INICIAL: TourEjemplo = { vistos: 0, enlaceVisto: false };
export const TOTAL_PASOS = 8;

export function pasoDeGuia(d: DatosActivacion, pathname: string, tour: TourEjemplo = TOUR_INICIAL): PasoGuia | null {
  if (!cuentaNueva(d)) return null;
  const ej = d.ejemploId;
  const ficha = ej ? `/app/expedientes/${ej}` : "/app/ejemplo"; // sin ejemplo: la página lo siembra y redirige
  const enFicha = Boolean(ej) && pathname === ficha;
  const enFormularios = Boolean(ej) && pathname === `${ficha}/formularios`;
  const v = tour.vistos;
  const P = (p: PasoGuia): PasoGuia => p;
  // Fuera de la ficha durante el ejemplo: una tarjeta que lleva de vuelta, con el número del paso.
  const volver = (n: number, titulo: string, texto: string): PasoGuia => P({ key: `volver-${n}`, n, titulo, texto, ir: ficha, cta: n === 1 ? "Abrir el ejemplo" : "Volver al ejemplo" });

  // Ejemplo borrado a propósito a mitad de visita: no insistir, seguir con lo real.
  const ejemploHecho = (v >= 5 && Boolean(d.ejemploFormulariosGenerados)) || (!ej && v >= 2);
  if (!ejemploHecho) {
    if (v < 2) {
      if (enFicha) return P({ key: "informacion", n: 2, anclaje: "informacion", abrir: "informacion", titulo: "La ficha, rellenada por la IA", texto: "Nombre, NIE, pasaporte…: leídos de sus documentos.", cta: "Siguiente", avanza: 2 });
      return volver(1, "Tu primer expediente ya está hecho", "Ábrelo y mira lo que hace la IA.");
    }
    if (v < 3) {
      if (enFicha) return P({ key: "documentos", n: 3, anclaje: "documentos", abrir: "documentos", titulo: "Cuatro documentos validados", texto: "Leídos y comprobados uno a uno. Nada que teclear.", cta: "Siguiente", avanza: 3 });
      return volver(3, "Cuatro documentos validados", "Vuelve al ejemplo para verlos.");
    }
    if (v < 4) {
      if (enFicha) return P({ key: "citas", n: 4, anclaje: "citas", abrir: "citas", titulo: "Citas con el cliente", texto: "Videollamada o presencial, con recordatorio automático.", cta: "Siguiente", avanza: 4 });
      return volver(4, "Citas con el cliente", "Vuelve al ejemplo para verlas.");
    }
    if (v < 5) {
      if (enFicha) return P({ key: "cobro", n: 5, anclaje: "cobro", abrir: "cobro", titulo: "Cobro y factura", texto: "Anticipo, factura y pago con tarjeta o transferencia.", cta: "Siguiente", avanza: 5 });
      return volver(5, "Cobro y factura", "Vuelve al ejemplo para verlo.");
    }
    // 6 · formularios generados de verdad (hecho: la descarga los registra)
    if (enFormularios) return P({ key: "descargar", n: 6, anclaje: "descargar", titulo: "Descarga el EX-17 relleno", texto: "Se genera con los datos de la ficha. Ábrelo y compruébalo.", cta: "" });
    if (enFicha) return P({ key: "generar", n: 6, anclaje: "generar", titulo: "Ahora, los formularios", texto: "El EX-17 y la tasa 790 salen rellenados.", ir: `${ficha}/formularios`, cta: "Ir a formularios" });
    return volver(6, "Ahora, los formularios", "Vuelve al ejemplo para generarlos.");
  }

  // 7 · un expediente para un cliente de verdad: el camino natural del producto. Nada de
  // teclear al cliente aparte ni subir su pasaporte: se le manda el enlace y él sube.
  if (d.expedientes === 0) {
    if (pathname === "/app/expedientes/nuevo") {
      return P({ key: "crear-expediente", n: 7, anclajes: ["cliente-nuevo"], textos: { "cliente-nuevo": { titulo: "Pulsa «Cliente nuevo»", texto: "Nombre, apellidos y su WhatsApp. Nada más." } }, titulo: "Crea el expediente", texto: "Con su nombre basta. Le llegará un enlace para elegir su trámite y subir sus documentos.", cta: "" });
    }
    return P({ key: "expediente", n: 7, anclaje: "nuevo-expediente", titulo: "Ahora, un cliente de verdad", texto: "Ábrele un expediente: le enviarás un enlace y subirá sus documentos.", ir: "/app/expedientes/nuevo", cta: "Nuevo expediente" });
  }
  // 8 · enviarle el enlace. Crear ya lo genera (evento «Enlace del portal generado»); lo que
  // queda es ENVIARLO y eso no deja hecho en base: se confirma con el botón, que cierra la guía.
  if (!tour.enlaceVisto) {
    if (pathname === "/app/expedientes/nuevo") return P({ key: "enviar-enlace", n: 8, anclaje: "enviar-enlace", titulo: "Envíale el enlace por WhatsApp", texto: "Elegirá su trámite y subirá sus documentos desde el móvil.", cta: "Terminar la guía", termina: true });
    return P({ key: "enlace", n: 8, titulo: "Envíale el enlace de su portal", texto: "Está en su expediente. Tu cliente sube el resto desde el móvil.", cta: "Terminar la guía", termina: true });
  }
  return null;
}
