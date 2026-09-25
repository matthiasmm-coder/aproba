-- Estadísticas de facturación (25/09/2026): lo facturado ANTES de Aproba con su desglose de
-- IVA, y facturas recibidas importadas de la hoja de cálculo del despacho (sin el PDF).
--
-- Por qué: Facturas › Estadísticas compara ingresos y gastos SIN IVA. Una factura importada
-- solo con su total no puede entrar en esa cuenta, y las recibidas que el despacho llevaba
-- en su Excel no existían en Aproba sin su archivo.
--
-- Idempotente: se puede ejecutar dos veces sin error.

-- 1. Historial importado: base imponible y cuota de IVA de cada factura (opcionales).
alter table "ServicioHistorico" add column if not exists "baseImponible" numeric(12,2);
alter table "ServicioHistorico" add column if not exists "cuotaIva"      numeric(12,2);

-- 2. Facturas recibidas: el archivo deja de ser obligatorio (una importada de la hoja de
--    cálculo trae los datos sin el PDF; la lista la marca «sin PDF»).
alter table "FacturaRecibida" alter column "archivoPath"   drop not null;
alter table "FacturaRecibida" alter column "archivoNombre" drop not null;
alter table "FacturaRecibida" alter column "archivoMime"   drop not null;

-- Que la API vea ya las columnas nuevas:
notify pgrst, 'reload schema';
