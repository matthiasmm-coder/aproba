-- ────────────────────────────────────────────────────────────────────────────────────
-- FACTURA SIMPLIFICADA (petición de Juan, Gestoría Extranjería Valencia, 29/09/2026:
-- «factura simplificada, especialmente para importes de hasta 400 € IVA incluido»).
--
-- La factura simplificada (RD 1619/2012, arts. 4 y 7; el antiguo «ticket») se puede expedir
-- cuando el importe no supera 400 € IVA incluido. No necesita los datos del cliente (ni
-- nombre, ni NIF, ni domicilio): basta número, fecha, los datos del despacho, el servicio,
-- el tipo de IVA («IVA incluido») y el total.
--
--   • Factura.simplificada → true = factura simplificada: su título lo dice, no lleva el
--     bloque fiscal del cliente ni retención, y VERI*FACTU la registra como F2 (su
--     rectificativa, como R5). false = factura completa (todas las anteriores).
--   • La serie es el prefijo «S» del número: S-2026-0001 (o S-DG-2026-0001 con oficina),
--     como la «R» de las rectificativas. La columna hace falta igualmente: en el modo
--     avanzado el despacho puede escribir cualquier número.
--
-- Migración aditiva e idempotente. Ejecutar una vez en el editor SQL de Supabase. Sin ella,
-- la casilla «Factura simplificada» no aparece y todo lo demás sigue igual.
-- ────────────────────────────────────────────────────────────────────────────────────

alter table "Factura" add column if not exists "simplificada" boolean not null default false;

-- Comprobación (todas las anteriores quedan como completas):
-- select count(*) filter (where "simplificada") as simplificadas, count(*) as total from "Factura";
