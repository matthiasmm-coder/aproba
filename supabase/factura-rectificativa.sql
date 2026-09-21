-- ────────────────────────────────────────────────────────────────────────────────────
-- FACTURA RECTIFICATIVA (petición de Luis, Asenjo Global, 21/09/2026).
--
-- Una factura emitida no se borra: la normativa española exige una numeración
-- correlativa sin huecos, y con VERI*FACTU quedará además registrada en la AEAT. Lo que
-- corrige una factura ya emitida (importe equivocado, cliente equivocado, cobro que hay
-- que devolver) es una FACTURA RECTIFICATIVA (RD 1619/2012, art. 15): documento propio,
-- con su número en una SERIE ESPECÍFICA, que identifica la factura rectificada.
--
-- Hasta hoy el producto mandaba al gestor a «emitir una rectificativa» en tres mensajes
-- de error… y no la tenía. Esta columna la ata a su original.
--
--   • Factura.rectificaId → la factura que rectifica (null = factura normal).
--   • La serie es el prefijo «R» del número: R-2026-0001 (o R-DG-2026-0001 con oficina).
--     No hace falta columna: `like 'R-2026-%'` aísla la serie por construcción y
--     `like '2026-%'` no la atrapa (el patrón ancla el principio).
--
-- Migración aditiva e idempotente. Ejecutar una vez en el editor SQL de Supabase.
-- Sin ella, el botón «Emitir rectificativa» avisa de la migración pendiente y todo lo
-- demás sigue igual.
-- ────────────────────────────────────────────────────────────────────────────────────

alter table "Factura" add column if not exists "rectificaId" text;
create index if not exists "Factura_rectificaId_idx" on "Factura"("rectificaId");

-- Si la rectificada desapareciera (borrado de un borrador), la rectificativa se conserva
-- sin vínculo: un documento emitido nunca se borra en cascada.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Factura_rectificaId_fkey') then
    alter table "Factura" add constraint "Factura_rectificaId_fkey"
      foreign key ("rectificaId") references "Factura"("id") on delete set null;
  end if;
end $$;

-- Una factura se rectifica UNA vez: dos rectificativas sobre la misma original
-- duplicarían el abono. El índice lo impide en la base, no solo en el código.
create unique index if not exists "Factura_rectificaId_unico" on "Factura"("rectificaId") where "rectificaId" is not null;

-- Comprobación:
--   select column_name from information_schema.columns
--    where table_name = 'Factura' and column_name = 'rectificaId';   -- → 1 fila
