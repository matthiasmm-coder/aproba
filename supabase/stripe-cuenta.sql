-- ─────────────────────────────────────────────────────────────────────────────
-- Cobro con tarjeta del cliente final (factura) → cuenta Stripe de la gestoría.
-- Migración aditiva y segura (solo crea una tabla nueva). Ejecutar una vez en el
-- editor SQL de Supabase. Hasta entonces, el cobro con tarjeta queda desactivado y
-- los emails siguen ofreciendo solo transferencia (nada se rompe).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "StripeCuenta" (
  "workspaceId"  text        primary key references "Workspace"("id") on delete cascade,
  "secretKeyEnc" text        not null,                 -- clave Stripe (sk_/rk_) cifrada AES-256-GCM
  "activa"       boolean     not null default true,
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now()
);

-- RLS «deny-all»: con RLS activado y SIN políticas, ni anon ni authenticated pueden
-- leer/escribir. Solo el service_role (que omite RLS) accede, desde el backend.
alter table "StripeCuenta" enable row level security;

-- Belt-and-suspenders: revoca cualquier grant de tabla a los roles del navegador.
revoke all on "StripeCuenta" from anon, authenticated;
