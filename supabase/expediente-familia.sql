-- ─────────────────────────────────────────────────────────────────────────────
-- Expediente familiar: UN expediente cubre a toda una familia. Se marca con
-- Expediente.familiaId (nullable). Si está presente → el expediente es familiar (su
-- clienteId es el titular; los demás miembros son Cliente con el mismo familiaId), y el
-- portal recoge la ficha de cada miembro + los documentos (comunes una sola vez).
-- Migración aditiva e idempotente. Ejecutar una vez en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Expediente" add column if not exists "familiaId" text;
create index if not exists "Expediente_familiaId_idx" on "Expediente"("familiaId");

-- FK opcional hacia Familia (si la familia se borra, el expediente se conserva sin vínculo).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Expediente_familiaId_fkey') then
    alter table "Expediente"
      add constraint "Expediente_familiaId_fkey"
      foreign key ("familiaId") references "Familia"("id") on delete set null;
  end if;
end $$;
