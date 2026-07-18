-- Snapshot de los datos fiscales del cliente en la factura (pedido de Juan):
-- NIE/DNI o pasaporte y dirección, congelados AL EMITIR — una factura emitida no
-- debe cambiar retroactivamente cuando el cliente se muda (y VeriFactu lo exigirá).
ALTER TABLE "Factura" ADD COLUMN IF NOT EXISTS "clienteDatos" JSONB;
