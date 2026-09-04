-- Escaneos del QR de la tarjeta (03/09/2026) — OPCIONAL.
-- Sin esta tabla la página /m funciona igual; solo deja de contar los escaneos.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

create table if not exists "EscaneoQR" (
  "id"        text        primary key,
  "fuente"    text,                              -- de dónde viene: tarjeta, metal, firma…  (/m?s=metal)
  "userAgent" text,
  "referer"   text,
  "createdAt" timestamptz not null default now()
);
create index if not exists "EscaneoQR_createdAt_idx" on "EscaneoQR"("createdAt" desc);

-- No es dato de ningún despacho: RLS activo y SIN política pública.
-- Solo la clave de servicio (la app) escribe, y el SQL Editor lee.
alter table "EscaneoQR" enable row level security;

-- Cuántos escaneos por día y por soporte:
-- select date_trunc('day', "createdAt")::date as dia, coalesce(fuente,'—') as fuente, count(*)
--   from "EscaneoQR" group by 1,2 order by 1 desc;
