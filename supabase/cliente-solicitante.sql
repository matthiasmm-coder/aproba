-- ─────────────────────────────────────────────────────────────────────────────
-- Expediente familiar: varios miembros pueden ser "solicitante" (el trámite es para
-- ellos), independientemente del titular (representante/contacto). Cliente.esSolicitante
-- marca a cada solicitante → sus documentos personales se piden en el portal.
-- Migración aditiva e idempotente. Ejecutar una vez en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Cliente" add column if not exists "esSolicitante" boolean not null default false;
