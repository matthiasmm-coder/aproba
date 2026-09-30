// DEHú AUTOMÁTICA — FASE PILOTO (30/09/2026).
//
// En cuanto llegaron la clave (DEHU_CLAVE_CERTIFICADOS) y la migración, la tarjeta «DEHú
// automática · Conectar» salió en la pestaña DEHú de TODOS los despachos, clientes de pago
// incluidos: invitaba a subir un certificado real a un servicio que aún no está validado.
// Hasta que (1) la integración pase el entorno de pruebas de la DEHú (alta LEMA en pruebas y
// envíos de prueba) y (2) el DPA recoja la custodia del certificado, la tarjeta y la conexión
// solo existen en estos espacios de demostración. Abrirla a un despacho = añadir su id aquí
// (con su DPA firmado); abrirla a todos = sustituir la comprobación por `true`.
export const DESPACHOS_PILOTO_DEHU: ReadonlySet<string> = new Set([
  "db135ffb-e0b8-442c-b654-795ede089185", // Gestoría de Carmen (pruebas)
  "ws_lc054xg1az", // Gestoría Vallès (demostración)
  "40b0012c-e706-4016-9586-4454d17634c8", // Varent (demostración)
]);

export const dehuAutomaticaPermitida = (workspaceId: string | null | undefined): boolean =>
  Boolean(workspaceId && DESPACHOS_PILOTO_DEHU.has(workspaceId));
