-- ─────────────────────────────────────────────────────────────────────────────
-- Integración Google Calendar/Meet por gestoría (OAuth «por gestor»).
-- Migración aditiva. Ejecutar una vez en el editor SQL de Supabase.
-- Hasta entonces: replis en el código — la conexión Google aparece como no
-- disponible y las citas siguen funcionando en modo enlace manual.
-- ─────────────────────────────────────────────────────────────────────────────

-- Credencial OAuth de Google (refresh token) por workspace, CIFRADA (AES-256-GCM,
-- misma receta que StripeCuenta). Tabla separada de Workspace a propósito: las filas
-- de Workspace son legibles por sus miembros vía RLS y no existe RLS por columna.
create table if not exists "GoogleCalendarCuenta" (
  "workspaceId"   text        primary key references "Workspace"("id") on delete cascade,
  "credencialEnc" text        not null,                 -- JSON {refresh_token} cifrado
  "activa"        boolean     not null default true,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

-- RLS «deny-all»: con RLS activado y SIN políticas, ni anon ni authenticated pueden
-- leer/escribir. Solo el service_role (que omite RLS) accede, desde el backend.
alter table "GoogleCalendarCuenta" enable row level security;
revoke all on "GoogleCalendarCuenta" from anon, authenticated;

-- Evento de Google Calendar creado para la cita (modo automático): permite
-- actualizarlo/borrarlo cuando la cita cambia o se elimina.
ALTER TABLE "CitaPrevia" ADD COLUMN IF NOT EXISTS "googleEventoId" TEXT;
