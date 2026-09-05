// GUÍA INTERACTIVA (05/09/2026): en vez de bloques de texto, un solo paso a la vez,
// señalado sobre el elemento real de la pantalla. Módulo puro: decide QUÉ paso toca
// según el estado del despacho y la ruta; el componente (guia-activacion.tsx) lo pinta.
//
// Orden = el de la checklist: primero el ejemplo (ver la IA sin depender de ningún
// cliente), luego un cliente real, su pasaporte subido por el despacho, su expediente,
// el enlace del portal. Cuando todo está hecho, la guía desaparece sola.
import { cuentaNueva, type DatosActivacion } from "@/lib/activacion";
export { cuentaNueva, GUIA_DESDE } from "@/lib/activacion";

export type PasoGuia = {
  key: string;
  titulo: string;   // ≤ 6 palabras
  texto: string;    // UNA línea
  anclaje?: string; // data-guia del elemento a señalar en ESTA página
  ir?: string;      // destino del botón cuando el elemento no está en esta página
  cta: string;      // etiqueta del botón
  n: number;        // posición (1..TOTAL) para los puntos de progreso
};
export const TOTAL_PASOS = 5;

// Solo para cuentas nacidas con la guía: ver cuentaNueva() en lib/activacion.ts.
export function pasoDeGuia(d: DatosActivacion, pathname: string): PasoGuia | null {
  if (!cuentaNueva(d)) return null;
  const ej = d.ejemploId;
  const enFichaEjemplo = Boolean(ej) && pathname === `/app/expedientes/${ej}`;
  const enFormulariosEjemplo = Boolean(ej) && pathname === `/app/expedientes/${ej}/formularios`;

  if (!d.ejemploFormulariosGenerados) {
    if (enFormulariosEjemplo) return { key: "marcar", n: 1, anclaje: "marcar", titulo: "Genera los formularios", texto: "El EX-17 y la tasa 790 salen rellenados con la ficha.", cta: "Entendido" };
    if (enFichaEjemplo) return { key: "generar", n: 1, anclaje: "generar", titulo: "Cuatro documentos ya validados", texto: "La IA los ha leído. Ahora, los formularios.", ir: `/app/expedientes/${ej}/formularios`, cta: "Ir a formularios" };
    return { key: "ejemplo", n: 1, anclaje: "ejemplo", titulo: "Tu primer expediente ya está hecho", texto: "Ábrelo y mira lo que hace la IA.", ir: ej ? `/app/expedientes/${ej}` : "/app/ejemplo", cta: "Abrir el ejemplo" };
  }
  if (d.clientes === 0) {
    return { key: "cliente", n: 2, titulo: "Ahora, un cliente de verdad", texto: "Da de alta a uno que ya tengas.", ir: "/app/clientes/nuevo", cta: "Crear cliente" };
  }
  if ((d.documentosPropios ?? 0) === 0) {
    const enFichaCliente = /^\/app\/clientes\/[^/]+$/.test(pathname) && !pathname.endsWith("/nuevo");
    if (enFichaCliente) return { key: "subir", n: 3, anclaje: "subir", titulo: "Sube su pasaporte", texto: "La IA lo lee y rellena su ficha.", cta: "Entendido" };
    return { key: "subir-ir", n: 3, titulo: "Sube su pasaporte", texto: "Desde su ficha: la IA lo lee y rellena los datos.", ir: "/app/clientes", cta: "Ir a clientes" };
  }
  if (d.expedientes === 0) {
    return { key: "expediente", n: 4, anclaje: "nuevo-expediente", titulo: "Ábrele su primer expediente", texto: "Elige el trámite: sus documentos ya están.", ir: "/app/expedientes/nuevo", cta: "Nuevo expediente" };
  }
  if (d.enlacesEnviados === 0) {
    return { key: "enlace", n: 5, titulo: "Envíale el enlace de su portal", texto: "Tu cliente sube el resto desde el móvil.", ir: "/app/expedientes", cta: "Ver expedientes" };
  }
  return null;
}
