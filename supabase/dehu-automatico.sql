-- DEHú AUTOMÁTICA (Gran Destinatario / LEMA) — Matthias, 29/09/2026.
--
-- Cada despacho que la activa confía a Aproba su certificado electrónico: el MISMO que dio
-- de alta como «Gran Destinatario» en la DEHú (menú «Configuración Gran destinatario»).
-- Aproba lo guarda CIFRADO (AES-256-GCM, lib/dehu/boveda.ts) con una clave que solo existe
-- en el servidor de producción (DEHU_CLAVE_CERTIFICADOS) y lo usa para:
--   · LISTAR las notificaciones pendientes (Localiza): sin abrirlas, sin efecto jurídico;
--   · traer el documento de las que el despacho YA abrió (LocalizaRealizadas + ConsultaRealizadas);
--   · ABRIR una notificación SOLO cuando un miembro pulsa «Abrir» y lo confirma
--     (PeticionAcceso): abrirla es darse por notificado (art. 43.2 Ley 39/2015).
-- Cada uso del certificado queda en "DehuUsoCertificado".
--
-- Seguridad: RLS activada SIN políticas: ni el navegador ni un usuario pueden leer estas
-- tablas; solo el servidor (service role). La pantalla recibe un resumen sin el certificado.
-- Idempotente: se puede ejecutar dos veces.

create table if not exists "DehuConexion" (
  "id" text primary key,
  "workspaceId" text not null unique references "Workspace"("id") on delete cascade,
  "estado" text not null default 'ACTIVA' check ("estado" in ('ACTIVA', 'ERROR', 'PAUSADA')),
  "entorno" text not null default 'PRODUCCION' check ("entorno" in ('PRUEBAS', 'PRODUCCION')),
  "certificadoCifrado" text not null,
  "claveCifrada" text not null,
  "titularNombre" text,
  "titularNif" text,
  "receptorNombre" text,
  "receptorNif" text,
  "certTipo" text,
  "certEmisor" text,
  "certSerie" text,
  "certCaducaAt" timestamptz,
  "ultimaConsultaAt" timestamptz,
  "ultimoExitoAt" timestamptz,
  "ultimoError" text,
  "erroresSeguidos" integer not null default 0,
  "realizadasDesde" timestamptz,
  "creadoPorId" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
alter table "DehuConexion" enable row level security;

create table if not exists "DehuUsoCertificado" (
  "id" text primary key,
  "workspaceId" text not null references "Workspace"("id") on delete cascade,
  "operacion" text not null,
  "identificador" text,
  "resultado" text not null check ("resultado" in ('OK', 'ERROR')),
  "codigoRespuesta" text,
  "detalle" text,
  "userId" text,
  "createdAt" timestamptz not null default now()
);
create index if not exists "DehuUso_ws_fecha" on "DehuUsoCertificado" ("workspaceId", "createdAt" desc);
alter table "DehuUsoCertificado" enable row level security;

-- Las notificaciones que trae la DEHú automática llevan origen 'LEMA'.
alter table "NotificacionDehu" drop constraint if exists "NotificacionDehu_origen_check";
alter table "NotificacionDehu" add constraint "NotificacionDehu_origen_check" check ("origen" in ('PDF', 'AVISO_EMAIL', 'LEMA'));

-- Comprobación: dos filas «true» (RLS activada) y la restricción nueva, sin errores.
-- select relname, relrowsecurity from pg_class where relname in ('DehuConexion', 'DehuUsoCertificado');
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'NotificacionDehu_origen_check';
