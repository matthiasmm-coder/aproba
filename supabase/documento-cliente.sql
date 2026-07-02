-- ─────────────────────────────────────────────────────────────────────────────
-- Documentos por MIEMBRO en un expediente familiar. Documento.clienteId (nullable):
--   • null      → documento COMÚN de la familia (se sube una sola vez)
--   • un cliente → documento personal de ESE miembro
-- Así un mismo tipo (p. ej. Pasaporte) coexiste para varios miembros del expediente.
-- Migración aditiva e idempotente. Ejecutar una vez en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Documento" add column if not exists "clienteId" text;
create index if not exists "Documento_clienteId_idx" on "Documento"("clienteId");

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Documento_clienteId_fkey') then
    alter table "Documento"
      add constraint "Documento_clienteId_fkey"
      foreign key ("clienteId") references "Cliente"("id") on delete set null;
  end if;
end $$;
