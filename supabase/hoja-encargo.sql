-- ─────────────────────────────────────────────────────────────────────────────
-- Hoja de encargo + mandato de representación (petición del 1er cliente real).
-- • Workspace: interruptor + datos del mandatario (gestor persona física que firma
--   el mandato: DNI, nº de colegiado y colegio — opcionales, un abogado no colegiado
--   como gestor administrativo los deja vacíos).
-- • ServicioConfig.noIncluye: «servicios no incluidos» POR SERVICIO (varía según el
--   trámite — confirmado por el cliente).
-- • DocumentoTipo: dos huecos nuevos para los documentos FIRMADOS que sube el cliente.
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Workspace" add column if not exists "hojaEncargoActiva" boolean not null default false;
alter table "Workspace" add column if not exists "mandatarioNombre" text;
alter table "Workspace" add column if not exists "mandatarioDni" text;
alter table "Workspace" add column if not exists "mandatarioColegiado" text;
alter table "Workspace" add column if not exists "mandatarioColegio" text;

alter table "ServicioConfig" add column if not exists "noIncluye" text;

alter type "DocumentoTipo" add value if not exists 'HOJA_ENCARGO';
alter type "DocumentoTipo" add value if not exists 'MANDATO';
