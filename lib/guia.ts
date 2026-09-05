// GUÍA INTERACTIVA (05/09/2026): en vez de bloques de texto, un solo paso a la vez,
// señalado sobre el elemento real de la pantalla. Módulo puro: decide QUÉ paso toca
// según el estado del despacho, la ruta y lo que ya se ha mirado; el componente
// (guia-activacion.tsx) lo pinta.
//
// Dos fases con su propia progresión (pedido de Matthias, 05/09 noche):
//  · «El ejemplo» (6 pasos): abrirlo → información → documentos → formularios (generados
//    DE VERDAD: la descarga del EX-17 los registra) → citas → cobro. Todo en la ficha.
//  · «Tu primer expediente real» (4 pasos): cliente → su pasaporte → expediente → enlace.
// Los pasos de «mirar» (información, documentos, citas, cobro) se confirman con
// «Siguiente» y se recuerdan en el navegador; los demás se deducen de los hechos.
// Solo para cuentas nacidas con la guía: ver cuentaNueva() en lib/activacion.ts.
import { cuentaNueva, type DatosActivacion } from "@/lib/activacion";
export { cuentaNueva, GUIA_DESDE } from "@/lib/activacion";

export type FaseGuia = "ejemplo" | "real";
export type PasoGuia = {
  key: string;
  fase: FaseGuia;
  n: number;        // posición dentro de la fase (1..total) para los puntos de progreso
  total: number;
  titulo: string;   // ≤ 6 palabras
  texto: string;    // UNA línea
  cta: string;      // etiqueta del botón
  anclaje?: string; // data-guia del elemento a señalar en ESTA página
  anclajes?: string[]; // alternativas por orden: se señala el PRIMER data-guia presente (p. ej. lista de clientes → botón crear)
  abrir?: string;   // id de sección plegable de la ficha que hay que abrir (evento abrir-seccion)
  ir?: string;      // destino del botón cuando el elemento no está en esta página
  avanza?: number;  // paso de «mirar»: el botón lo confirma y deja vistos = avanza
  termina?: boolean; // último paso de la fase real: el botón cierra la guía (enlaceVisto)
};
// vistos: 2 información · 3 documentos · 5 citas · 6 cobro. enlaceVisto: el gestor ya vio
// cómo enviar el enlace (no hay hecho en base: copiar o abrir WhatsApp no dejan rastro).
export type TourEjemplo = { vistos: number; enlaceVisto?: boolean };
export const TOUR_INICIAL: TourEjemplo = { vistos: 0, enlaceVisto: false };
export const PASOS_EJEMPLO = 6;
export const PASOS_REAL = 4;

export function pasoDeGuia(d: DatosActivacion, pathname: string, tour: TourEjemplo = TOUR_INICIAL): PasoGuia | null {
  if (!cuentaNueva(d)) return null;
  const ej = d.ejemploId;
  const ficha = ej ? `/app/expedientes/${ej}` : "/app/ejemplo"; // sin ejemplo: la página lo siembra y redirige
  const enFicha = Boolean(ej) && pathname === ficha;
  const enFormularios = Boolean(ej) && pathname === `${ficha}/formularios`;
  const v = tour.vistos;
  const E = (p: Omit<PasoGuia, "fase" | "total">): PasoGuia => ({ ...p, fase: "ejemplo", total: PASOS_EJEMPLO });
  const R = (p: Omit<PasoGuia, "fase" | "total">): PasoGuia => ({ ...p, fase: "real", total: PASOS_REAL });
  // Fuera de la ficha: una tarjeta que lleva de vuelta, con el número del paso pendiente.
  const volver = (n: number, titulo: string, texto: string): PasoGuia => E({ key: `volver-${n}`, n, titulo, texto, ir: ficha, cta: n === 1 ? "Abrir el ejemplo" : "Volver al ejemplo" });

  // Ejemplo borrado a propósito a mitad de visita: no insistir, pasar a lo real.
  const ejemploCompleto = v >= 6 || (!ej && v >= 2);
  if (!ejemploCompleto) {
    if (v < 2) {
      if (enFicha) return E({ key: "informacion", n: 2, anclaje: "informacion", abrir: "informacion", titulo: "La ficha, rellenada por la IA", texto: "Nombre, NIE, pasaporte…: leídos de sus documentos.", cta: "Siguiente", avanza: 2 });
      return volver(1, "Tu primer expediente ya está hecho", "Ábrelo y mira lo que hace la IA.");
    }
    if (v < 3) {
      if (enFicha) return E({ key: "documentos", n: 3, anclaje: "documentos", abrir: "documentos", titulo: "Cuatro documentos validados", texto: "Leídos y comprobados uno a uno. Nada que teclear.", cta: "Siguiente", avanza: 3 });
      return volver(3, "Cuatro documentos validados", "Vuelve al ejemplo para verlos.");
    }
    if (!d.ejemploFormulariosGenerados) {
      if (enFormularios) return E({ key: "descargar", n: 4, anclaje: "descargar", titulo: "Descarga el EX-17 relleno", texto: "Se genera con los datos de la ficha. Ábrelo y compruébalo.", cta: "Entendido" });
      if (enFicha) return E({ key: "generar", n: 4, anclaje: "generar", titulo: "Ahora, los formularios", texto: "El EX-17 y la tasa 790 salen rellenados.", ir: `${ficha}/formularios`, cta: "Ir a formularios" });
      return volver(4, "Ahora, los formularios", "Vuelve al ejemplo para generarlos.");
    }
    if (v < 5) {
      if (enFicha) return E({ key: "citas", n: 5, anclaje: "citas", abrir: "citas", titulo: "Citas con el cliente", texto: "Videollamada o presencial, con recordatorio automático.", cta: "Siguiente", avanza: 5 });
      return E({ key: "volver-5", n: 5, titulo: "Formularios listos", texto: "Vuelve a la ficha: quedan las citas y el cobro.", ir: ficha, cta: "Volver al expediente" });
    }
    if (enFicha) return E({ key: "cobro", n: 6, anclaje: "cobro", abrir: "cobro", titulo: "Cobro y factura", texto: "Anticipo, factura y pago con tarjeta o transferencia.", cta: "Terminar el ejemplo", avanza: 6 });
    return volver(6, "Cobro y factura", "Último paso del ejemplo, en la ficha.");
  }

  // FASE REAL: cada paso se señala en la pantalla donde se hace; fuera de ella, la tarjeta
  // lleva a esa pantalla. Los hechos (cliente, documento propio, expediente) los cuenta
  // /api/activacion; las pantallas avisan con avisarGuia() al terminar su acción.
  if (d.clientes === 0) {
    if (pathname === "/app/clientes/nuevo") return R({ key: "guardar-cliente", n: 1, anclaje: "guardar-cliente", titulo: "Nombre y email bastan", texto: "Guarda: el resto lo leerá la IA de su pasaporte.", cta: "Entendido" });
    return R({ key: "cliente", n: 1, titulo: "Ahora, un cliente de verdad", texto: "Da de alta a uno que ya tengas.", ir: "/app/clientes/nuevo", cta: "Crear cliente" });
  }
  if ((d.documentosPropios ?? 0) === 0) {
    const enFichaCliente = /^\/app\/clientes\/[^/]+$/.test(pathname) && !pathname.endsWith("/nuevo");
    if (enFichaCliente) return R({ key: "subir", n: 2, anclaje: "subir", titulo: "Sube su pasaporte", texto: "La IA lo lee y rellena su ficha.", cta: "Entendido" });
    const fichaCliente = d.primerClienteId ? `/app/clientes/${d.primerClienteId}` : "/app/clientes";
    return R({ key: "subir-ir", n: 2, titulo: "Sube su pasaporte", texto: "Desde su ficha: la IA lo lee y rellena los datos.", ir: fichaCliente, cta: d.primerClienteId ? "Ir a su ficha" : "Ir a clientes" });
  }
  if (d.expedientes === 0) {
    // Mientras no haya cliente elegido, el formulario marca su lista (elegir-cliente); al elegir, queda el botón.
    if (pathname === "/app/expedientes/nuevo") return R({ key: "crear-expediente", n: 3, anclaje: "crear-expediente", anclajes: ["elegir-cliente", "crear-expediente"], titulo: "Elige a tu cliente y crea el expediente", texto: "Sus documentos ya están en su ficha.", cta: "Entendido" });
    return R({ key: "expediente", n: 3, anclaje: "nuevo-expediente", titulo: "Ábrele su primer expediente", texto: "Elige el trámite: sus documentos ya están.", ir: "/app/expedientes/nuevo", cta: "Nuevo expediente" });
  }
  if (!tour.enlaceVisto) {
    // Crear el expediente ya genera el enlace (evento «Enlace del portal generado»); lo que
    // queda es ENVIARLO, y eso no deja hecho en base: se confirma con el botón.
    if (pathname === "/app/expedientes/nuevo") return R({ key: "enviar-enlace", n: 4, anclaje: "enviar-enlace", titulo: "Envíale el enlace de su portal", texto: "Por WhatsApp o copiado: sube el resto desde el móvil.", cta: "Terminar la guía", termina: true });
    return R({ key: "enlace", n: 4, titulo: "Envíale el enlace de su portal", texto: "Está en su expediente. Tu cliente sube el resto desde el móvil.", cta: "Terminar la guía", termina: true });
  }
  return null;
}
