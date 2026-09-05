// GUÍA INTERACTIVA (05/09/2026): en vez de bloques de texto, un solo paso a la vez,
// señalado con una flecha sobre el elemento real de la pantalla. Módulo puro: decide QUÉ
// paso toca según el estado del despacho, la ruta y lo que ya se ha mirado; el componente
// (guia-activacion.tsx) lo pinta.
//
// UNA sola secuencia de 9 pasos, sin fases ni idas y vueltas (Matthias, 05-06/09):
//  1 menú Expedientes → 2 la tarjeta del ejemplo en el tablero → 3 información → 4 documentos
//  → 5 citas → 6 cobro (en la ficha, en ese orden) → 7 formularios generados DE VERDAD (la
//  descarga del EX-17 los registra; van al final para no volver) → 8 nuevo expediente para un
//  cliente nuevo (nombre y WhatsApp) → 9 copiar el enlace y pegárselo al cliente; al cerrar,
//  la ventana Aproba Despegue. Los pasos de «mirar» (3-6) se confirman con «Siguiente» y se
//  recuerdan en el navegador; los demás se deducen de los hechos. Solo para cuentas nacidas
//  con la guía (cuentaNueva).
import { cuentaNueva, type DatosActivacion } from "@/lib/activacion";
export { cuentaNueva, GUIA_DESDE } from "@/lib/activacion";

export type PasoGuia = {
  key: string;
  n: number;        // posición (1..TOTAL_PASOS), solo para la barra de progreso
  titulo: string;   // ≤ 6 palabras
  texto: string;    // UNA línea
  cta: string;      // etiqueta del botón ("" = sin botón)
  anclaje?: string; // data-guia del elemento a señalar en ESTA página
  anclajes?: string[]; // alternativas por orden: se señala el PRIMER data-guia presente
  textos?: Record<string, { titulo: string; texto: string }>; // título/texto según el anclaje señalado
  abrir?: string;   // id de sección plegable de la ficha que hay que abrir (evento abrir-seccion)
  debajoDe?: string; // data-guia de un bloque: la tarjeta va DEBAJO de él (no tapa sus botones) si no cabe en el hueco izquierdo
  ir?: string;      // destino del botón
  ctaSoloSinAncla?: boolean; // el botón solo sale si el elemento NO está en pantalla (si está, basta la flecha)
  avanza?: number;  // paso de «mirar»: el botón lo confirma y deja vistos = avanza
  copia?: boolean;  // el botón confirma que el enlace ya se envió
  termina?: boolean; // último paso: el botón cierra la guía y abre Aproba Despegue
};
// vistos: 3 información · 4 documentos · 5 citas · 6 cobro. enlaceCopiado / enlaceVisto:
// pasos sin hecho en base (copiar un enlace no deja rastro), confirmados con el botón.
export type TourEjemplo = { vistos: number; enlaceCopiado?: boolean; enlaceVisto?: boolean };
export const TOUR_INICIAL: TourEjemplo = { vistos: 0, enlaceCopiado: false, enlaceVisto: false };
export const TOTAL_PASOS = 9;

export function pasoDeGuia(d: DatosActivacion, pathname: string, tour: TourEjemplo = TOUR_INICIAL): PasoGuia | null {
  if (!cuentaNueva(d)) return null;
  const ej = d.ejemploId;
  const ficha = ej ? `/app/expedientes/${ej}` : "/app/ejemplo"; // sin ejemplo: la página lo siembra y redirige
  const enPanel = pathname === "/app";
  const enTablero = pathname === "/app/expedientes";
  const enFicha = Boolean(ej) && pathname === ficha;
  const enFormularios = Boolean(ej) && pathname === `${ficha}/formularios`;
  const v = tour.vistos;
  const P = (p: PasoGuia): PasoGuia => p;
  // Fuera de la ficha a mitad de visita: una tarjeta que lleva de vuelta, con el número del paso.
  const volver = (n: number, titulo: string, texto: string): PasoGuia => P({ key: `volver-${n}`, n, titulo, texto, ir: ficha, cta: "Volver al ejemplo" });

  // Ejemplo borrado a propósito a mitad de visita: no insistir, seguir con lo real.
  const ejemploHecho = (v >= 6 && Boolean(d.ejemploFormulariosGenerados)) || (!ej && v >= 3);
  if (!ejemploHecho) {
    if (v < 3) {
      // Sin ejemplo sembrado (siembra fallida o borrado antes de empezar): /app/ejemplo lo siembra y abre.
      if (!ej && !enFicha) return P({ key: "sembrar", n: 1, titulo: "Tu primer expediente ya está hecho", texto: "Ábrelo y mira lo que hace la IA.", ir: "/app/ejemplo", cta: "Abrir el ejemplo" });
      if (enFicha) return P({ key: "informacion", n: 3, anclaje: "informacion", abrir: "informacion", titulo: "La ficha, rellenada por la IA", texto: "Nombre, NIE, pasaporte…: leídos de sus documentos.", cta: "Siguiente", avanza: 3 });
      if (enTablero && ej) return P({ key: "tarjeta", n: 2, anclaje: "tarjeta-ejemplo", titulo: "Ábrelo", texto: "Pulsa su tarjeta para ver la ficha.", ir: ficha, cta: "Abrir el ejemplo", ctaSoloSinAncla: true });
      if (enPanel) return P({ key: "menu", n: 1, anclaje: "menu-expedientes", titulo: "Tu primer expediente ya está hecho", texto: "Entra en Expedientes: está en el tablero.", ir: "/app/expedientes", cta: "Ver expedientes", ctaSoloSinAncla: true });
      return P({ key: "volver-1", n: 1, titulo: "Tu primer expediente ya está hecho", texto: "Está en el tablero de Expedientes.", ir: "/app/expedientes", cta: "Ver expedientes" });
    }
    if (v < 4) {
      if (enFicha) return P({ key: "documentos", n: 4, anclaje: "documentos", abrir: "documentos", titulo: "Cuatro documentos validados", texto: "Leídos y comprobados uno a uno. Nada que teclear.", cta: "Siguiente", avanza: 4 });
      return volver(4, "Cuatro documentos validados", "Vuelve al ejemplo para verlos.");
    }
    if (v < 5) {
      if (enFicha) return P({ key: "citas", n: 5, anclaje: "citas", abrir: "citas", titulo: "Citas con el cliente", texto: "Fecha, hora y lugar; el cliente recibe el aviso solo.", cta: "Siguiente", avanza: 5 });
      return volver(5, "Citas con el cliente", "Vuelve al ejemplo para verlas.");
    }
    if (v < 6) {
      if (enFicha) return P({ key: "cobro", n: 6, anclaje: "cobro", abrir: "cobro", titulo: "Cobro y factura", texto: "Anticipo ya facturado y pendiente; el resto, al terminar.", cta: "Siguiente", avanza: 6 });
      return volver(6, "Cobro y factura", "Vuelve al ejemplo para verlo.");
    }
    // 7 · formularios generados de verdad (hecho: la descarga los registra)
    if (enFormularios) return P({ key: "descargar", n: 7, anclaje: "descargar", debajoDe: "formularios-bloque", titulo: "Descarga el EX-17 relleno", texto: "Se genera con los datos de la ficha. Ábrelo y compruébalo.", cta: "" });
    if (enFicha) return P({ key: "generar", n: 7, anclaje: "generar", titulo: "Ahora, los formularios", texto: "El EX-17 y la tasa 790 salen rellenados.", ir: `${ficha}/formularios`, cta: "Ir a formularios" });
    return volver(7, "Ahora, los formularios", "Vuelve al ejemplo para generarlos.");
  }

  // 8 · un expediente para un cliente de verdad: el camino natural del producto. Nada de
  // teclear al cliente aparte ni subir su pasaporte: se le manda el enlace y él sube.
  if (d.expedientes === 0) {
    if (pathname === "/app/expedientes/nuevo") {
      return P({ key: "crear-expediente", n: 8, anclajes: ["cliente-nuevo"], textos: { "cliente-nuevo": { titulo: "Pulsa «Cliente nuevo»", texto: "Nombre, apellidos y su WhatsApp. Nada más." } }, titulo: "Crea el expediente", texto: "Con su nombre basta. Le llegará un enlace para elegir su trámite y subir sus documentos.", cta: "" });
    }
    return P({ key: "expediente", n: 8, anclaje: "nuevo-expediente", titulo: "Ahora, un cliente de verdad", texto: "Ábrele un expediente: le enviarás un enlace y subirá sus documentos.", ir: "/app/expedientes/nuevo", cta: "Nuevo expediente" });
  }
  // 9 · el enlace: se copia y se pega en un WhatsApp (muchos despachos no lo tienen en el
  // ordenador). No deja hecho en base: se confirma con el botón. Después, qué hará el cliente.
  if (!tour.enlaceCopiado) {
    if (pathname === "/app/expedientes/nuevo") return P({ key: "copiar-enlace", n: 9, anclaje: "enlace-portal", titulo: "Copia el enlace", texto: "Pégalo en un WhatsApp (o un email) a tu cliente.", cta: "Ya se lo he enviado", copia: true });
    return P({ key: "enlace", n: 9, titulo: "Envíale el enlace de su portal", texto: "Está en su expediente: cópialo y pégaselo por WhatsApp.", cta: "Ya se lo he enviado", copia: true });
  }
  if (!tour.enlaceVisto) return P({ key: "fin", n: 9, titulo: "Listo: tu cliente hace el resto", texto: "Al abrir el enlace elige su trámite, rellena sus datos y sube sus documentos.", cta: "Terminar la guía", termina: true });
  return null;
}
