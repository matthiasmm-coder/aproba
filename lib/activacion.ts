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

// Orden DELIBERADO, en dos tiempos (05/09/2026):
//  1. La PRIMERA SESIÓN — lo que el gestor puede hacer solo, en diez minutos, y que le
//     enseña lo que hace la IA: abrir el expediente de ejemplo (cuatro documentos ya
//     validados) y generar sus formularios; después subir ÉL un pasaporte de un cliente
//     que ya tenga. Medido en 75 días de altas: cinco de nueve prospectos crearon un
//     expediente el día 1, vieron una lista de documentos vacía que esperaba a un cliente
//     inexistente, y no volvieron. La lista anterior empezaba justo por ese punto muerto.
//  2. La SEMANA UNO — el camino crítico de la adopción (cliente → expediente → enlace →
//     documento subido POR EL CLIENTE), que sigue siendo el umbral real.
//  3. La administración, al final: configurar servicios y cuenta no compromete a nadie.
export function construirChecklist(d: DatosActivacion, t: (s: string) => string): ChecklistItem[] {
  const items: ChecklistItem[] = [
    // El ejemplo solo se ofrece a las cuentas nacidas con él (ver cuentaNueva): a un despacho
    // con años de expedientes no se le propone «abrir su primer expediente».
    ...(cuentaNueva(d) ? [{ key: "ejemplo", label: t("Abre el expediente de ejemplo y genera sus formularios"), href: d.ejemploId ? `/app/expedientes/${d.ejemploId}` : "/app/ejemplo", done: Boolean(d.ejemploFormulariosGenerados) }] : []),
    { key: "clientes", label: t("Da de alta a tu primer cliente"), href: "/app/clientes/nuevo", done: d.clientes > 0 },
    { key: "documento_propio", label: t("Sube el pasaporte de un cliente que ya tengas y mira cómo lo valida la IA"), href: "/app/clientes", done: (d.documentosPropios ?? 0) > 0 },
    { key: "expediente", label: t("Ábrele su primer expediente"), href: "/app/expedientes/nuevo", done: d.expedientes > 0 },
    { key: "enlace", label: t("Envíale el enlace de su portal"), href: "/app/expedientes", done: d.enlacesEnviados > 0 },
    { key: "documento", label: t("Recibe su primer documento"), href: "/app/expedientes", done: d.subidasDeCliente > 0 },
    { key: "servicios", label: t("Ajusta tus servicios y precios"), href: "/app/ajustes", done: d.servicios > 0 },
    { key: "banco", label: t("Añade tu cuenta bancaria"), href: "/app/ajustes", done: d.cuentas > 0 },
  ];
  if (d.plan !== "STARTER") {
    items.push({ key: "equipo", label: t("Invita a tu equipo"), href: "/app/ajustes", done: d.miembros > 1 });
  }
  return items;
}

// El estado que no era visible en ninguna parte: el enlace salió y el cliente no ha
// hecho nada. Es donde estaban parados Joshua (4 enlaces, 0 subidas) y S&D (4 y 0),
// y ninguno de los dos volvió. No es un fallo del despacho ni del producto: es un
// cliente que no ha abierto su correo, y se arregla con un recordatorio.
export function esperandoAlCliente(d: DatosActivacion): boolean {
  return d.enlacesEnviados > 0 && d.subidasDeCliente === 0;
}
