import { useEffect } from "react";

// Bloquea el scroll del fondo mientras hay un diálogo abierto.
//
// Sin esto, en el móvil el dedo —o el teclado al abrirse sobre un campo— mueve la
// página de debajo mientras el diálogo, fijo al viewport, se queda clavado: la ventana
// se ve ancha y descolocada. Es el mismo síntoma en todos los modales de la app, así
// que el arreglo vive en un solo sitio.
//
// `activo` es para los diálogos que se montan siempre y se pintan según su estado; los
// que el padre monta solo al abrirlos pueden llamarlo sin argumento.
export function useScrollBloqueado(activo = true) {
  useEffect(() => {
    if (!activo) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previo; };
  }, [activo]);
}
