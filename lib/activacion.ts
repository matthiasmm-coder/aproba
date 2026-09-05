// ACTIVACIÓN — el camino que separa «he creado una cuenta» de «trabajo aquí».
//
// Medido el 18/08/2026 sobre los 6 despachos externos: 5 de 6 crean su primer
// cliente en 6 minutos y su primer expediente en 18. Entrar no cuesta nada. Pero
// solo 2 de 6 llegan a tres expedientes, y el único que paga (66 expedientes) es
// también el único cuyos CLIENTES suben documentos de forma masiva: 99 enlaces
// generados, 90 subidas del cliente. Los que se quedan por el camino generaron
// enlaces (4 y 4) y no recibieron NADA.
//
// De ahí el umbral real: no es «crear un expediente», es que un cliente de verdad
// suba su primer documento. Ese día el expediente deja de ser una prueba —el
// pasaporte del cliente solo existe aquí— y volver a Excel cuesta más que seguir.
//
// La checklist anterior daba «Envía el enlace a tu cliente» por hecho en cuanto el
// expediente salía de BORRADOR, algo que el gestor hace solo. Resultado medido:
// Gesnet la tenía COMPLETA al 100 % sin que ningún cliente hubiera entrado nunca en
// un portal. Una lista que se declara terminada antes del único gesto que importa
// no guía: engaña, y luego desaparece.

// El origen de una subida se lee del diario (ExpedienteEvento.descripcion), que ya
// distingue «El cliente subió: X» de «El despacho subió: X». Son cadenas escritas
// por el código, nunca por el usuario; se centralizan aquí para que un cambio de
// redacción rompa un test y no la métrica.
export const MARCA_SUBIDA_CLIENTE = "El cliente subió";
export const MARCA_ENLACE = "nlace"; // «Enlace del portal generado…», «Enlace enviado…»

export type ChecklistItem = { key: string; label: string; href: string; done: boolean };

export type DatosActivacion = {
  clientes: number;            // sin contar el cliente del ejemplo
  expedientes: number;         // sin contar el ejemplo
  enlacesEnviados: number;
  subidasDeCliente: number;
  servicios: number;
  cuentas: number;
  miembros: number;
  plan: string;
  // 05/09/2026 — la primera sesión. Ver el comentario de construirChecklist.
  ejemploId?: string | null;             // expediente de ejemplo del despacho (si existe)
  ejemploFormulariosGenerados?: boolean; // ya pulsó «Generar formularios» en el ejemplo
  documentosPropios?: number;            // documentos subidos POR EL DESPACHO fuera del ejemplo
  creadoEn?: string | null;              // Workspace.createdAt (UTC): guía y ejemplo solo para las cuentas nacidas con ellos
  primerClienteId?: string | null;       // un cliente real (no el del ejemplo)
  // 06/09/2026 — la checklist de Inicio es de CONFIGURACIÓN (el uso lo enseña la guía).
  serviciosConPrecio?: number;           // servicios del catálogo con anticipo o resto > 0
  datosFiscales?: boolean;               // NIF del despacho relleno
  hojaEncargoActiva?: boolean;           // hoja de encargo + mandato activados
  avisosPersonalizados?: number;         // avisos tocados (personalizados o desactivados)
};

// La guía y el expediente de ejemplo nacieron el 05/09/2026 (bfa522c, en producción a las
// 17:29 UTC) junto con el alta en una sola pantalla. Solo acompañan a las cuentas creadas
// desde entonces: un despacho anterior ya conoce el producto y vería un «tu primer
// expediente ya está hecho» absurdo sobre decenas de expedientes reales (visto en la demo).
// Sin fecha (columna no leída) → cuenta antigua: mejor callar que equivocarse.
export const GUIA_DESDE = "2026-09-05T17:00:00";
export function cuentaNueva(d: Pick<DatosActivacion, "creadoEn">): boolean {
  const c = d.creadoEn;
  if (!c) return false;
  return c.slice(0, 19) >= GUIA_DESDE; // ambos en UTC, formato ISO → comparación lexicográfica
}

// Checklist de Inicio (06/09/2026, pedido de Matthias): SOLO configuración del despacho.
// El uso de la plataforma (ejemplo, cliente, expediente, enlace) lo enseña la guía
// interactiva; aquí queda lo que conviene dejar listo antes de trabajar con clientes.
export function construirChecklist(d: DatosActivacion, t: (s: string) => string): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { key: "servicios", label: t("Pon precio a tus servicios"), href: "/app/ajustes#servicios", done: (d.serviciosConPrecio ?? 0) > 0 },
    { key: "banco", label: t("Añade tu cuenta bancaria"), href: "/app/ajustes#facturacion", done: d.cuentas > 0 },
    { key: "fiscal", label: t("Completa los datos fiscales de tu despacho"), href: "/app/ajustes#despacho", done: Boolean(d.datosFiscales) },
    { key: "encargo", label: t("Activa la hoja de encargo y el mandato"), href: "/app/ajustes#encargo", done: Boolean(d.hojaEncargoActiva) },
    { key: "avisos", label: t("Revisa los avisos automáticos a tus clientes"), href: "/app/ajustes#notificaciones", done: (d.avisosPersonalizados ?? 0) > 0 },
    { key: "importar", label: t("Importa tus clientes desde Excel o CSV"), href: "/app/importar", done: d.clientes > 0 },
  ];
  if (d.plan !== "STARTER") {
    items.push({ key: "equipo", label: t("Invita a tu equipo"), href: "/app/ajustes#plan", done: d.miembros > 1 });
  }
  return items;
}

export function esperandoAlCliente(d: DatosActivacion): boolean {
  return d.enlacesEnviados > 0 && d.subidasDeCliente === 0;
}
