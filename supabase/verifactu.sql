-- ─────────────────────────────────────────────────────────────────────────────
-- VERI*FACTU — 17/09/2026. RD 1007/2023 + Orden HAC/1177/2024 (RDL 15/2025: sociedades
-- 01/01/2027, autónomos 01/07/2027). Aproba envía cada factura emitida a la AEAT a través
-- de Verifacti (colaborador social; ellos generan huella, XML, encadenamiento y QR).
--
-- Dos tablas:
--   · VerifactuConfig   → una clave de empresa Verifacti por NIF emisor (despacho u oficina
--                          con NIF propio). deny-all: solo service_role la lee/escribe; la UI
--                          recibe el estado por API, nunca la clave.
--   · VerifactuRegistro → un registro por (factura, tipo ALTA|ANULACION): lo enviado, el
--                          uuid/url/huella devueltos y el estado que la AEAT acabó dando.
--                          Solo lectura bajo RLS (el despacho ve sus registros).
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "VerifactuConfig" (
  "id"                 text        primary key,
  "workspaceId"        text        not null references "Workspace"("id") on delete cascade,
  "nif"                text        not null,                       -- NIF emisor cubierto por esta clave (mayúsculas, sin guiones)
  "entorno"            text        not null default 'test',        -- test | prod (lo decide la clave de Verifacti)
  "apiKeyEnc"          text,                                       -- clave de empresa Verifacti, cifrada AES-256-GCM (lib/cifrado.ts)
  "activo"             boolean     not null default false,         -- envío en marcha para las facturas de este NIF
  "ultimaComprobacion" timestamptz,                                -- último /verifactu/health correcto
  "ultimoError"        text,
  "createdAt"          timestamptz not null default now(),
  "updatedAt"          timestamptz not null default now()
);
create unique index if not exists "VerifactuConfig_ws_nif_idx" on "VerifactuConfig"("workspaceId", "nif");
alter table "VerifactuConfig" enable row level security;   -- sin políticas: deny-all (como StripeCuenta)

create table if not exists "VerifactuRegistro" (
  "id"               text        primary key,
  "workspaceId"      text        not null references "Workspace"("id") on delete cascade,
  "facturaId"        text        not null references "Factura"("id") on delete cascade,
  "tipo"             text        not null,                         -- ALTA | ANULACION
  "entorno"          text        not null,                         -- test | prod
  "nif"              text        not null,                         -- NIF emisor con el que se registró
  "serie"            text        not null default '',
  "numero"           text        not null,
  "fechaExpedicion"  date        not null,
  "estado"           text        not null,                         -- PENDIENTE | CORRECTO | ACEPTADO_CON_ERRORES | INCORRECTO | DUPLICADO | ANULADO | NO_REGISTRADO | ERROR_ENVIO | BLOQUEADO
  "uuid"             text,                                         -- id del registro en Verifacti (para /status)
  "url"              text,                                         -- URL de verificación de la AEAT (contenido del QR)
  "huella"           text,
  "codigoError"      text,
  "mensajeError"     text,
  "motivo"           text,                                         -- por qué está BLOQUEADO / qué falló al enviar (legible para el gestor)
  "payload"          jsonb,                                        -- lo enviado (auditoría / reintento)
  "respuesta"        jsonb,                                        -- última respuesta de Verifacti
  "intentos"         integer     not null default 0,
  "proximoIntentoAt" timestamptz,
  "enviadoAt"        timestamptz,
  "confirmadoAt"     timestamptz,
  "createdAt"        timestamptz not null default now(),
  "updatedAt"        timestamptz not null default now()
);
create unique index if not exists "VerifactuRegistro_factura_tipo_idx" on "VerifactuRegistro"("facturaId", "tipo");
create index if not exists "VerifactuRegistro_ws_estado_idx" on "VerifactuRegistro"("workspaceId", "estado");

alter table "VerifactuRegistro" enable row level security;
drop policy if exists verifacturegistro_lectura on "VerifactuRegistro";
create policy verifacturegistro_lectura on "VerifactuRegistro"
  for select using ("workspaceId" in (select app_workspace_ids()));

-- Comprobación:
-- select count(*) from "VerifactuConfig"; select count(*) from "VerifactuRegistro";
