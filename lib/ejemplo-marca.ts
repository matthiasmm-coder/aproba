// Marca del expediente de EJEMPLO (05/09/2026). Módulo puro, importable desde cliente y
// servidor. Sin migración: el ejemplo se reconoce por su referencia fija y por el email
// fijo de su cliente. Todo lo que cuenta (memoria, checklist, sondas) debe excluirlo.
export const REFERENCIA_EJEMPLO = "EJEMPLO";
export const EMAIL_CLIENTE_EJEMPLO = "ejemplo@aproba-software.com";
export const esEjemplo = (referencia: string | null | undefined): boolean => referencia === REFERENCIA_EJEMPLO;
