-- ─────────────────────────────────────────────────────────────────────────────
-- Factura familiar: una única factura cubre a varios miembros de una familia (una línea
-- por miembro), facturada al titular. Se traza con Factura.familiaId (nullable) para poder
-- listarla en la vista Familia. Migración aditiva e idempotente. Ejecutar en Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Factura" add column if not exists "familiaId" text;
create index if not exists "Factura_familiaId_idx" on "Factura"("familiaId");

-- FK opcional hacia Familia (si la familia se borra, la factura se conserva sin vínculo).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Factura_familiaId_fkey') then
    alter table "Factura"
      add constraint "Factura_familiaId_fkey"
      foreign key ("familiaId") references "Familia"("id") on delete set null;
  end if;
end $$;
