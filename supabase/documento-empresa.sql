-- DOCUMENTOS DE LA EMPRESA (25/09/2026, petición de Luis — Asenjo).
--
-- La ficha de una empresa reúne ya los documentos de sus expedientes y de sus trabajadores
-- (hojas de encargo, mandatos, pasaportes, contratos…). Faltaba dónde guardar los de la
-- PROPIA empresa que no vienen de un expediente: CIF, escrituras, poderes, y todo lo que se
-- presentó en el pasado antes de Aproba. Mismo patrón que "DocumentoCliente".
--
-- Idempotente: se puede ejecutar dos veces sin error.

create table if not exists "DocumentoEmpresa" (
  "id"            text        primary key,
  "empresaId"     text        not null references "Empresa"("id")   on delete cascade,
  "workspaceId"   text        not null references "Workspace"("id") on delete cascade,
  "tipo"          text        not null,              -- etiqueta (CIF, Escritura, Poderes…)
  "nombreArchivo" text,
  "storagePath"   text        not null,              -- bucket privado `documentos`, ruta empresas/{id}/…
  "mimeType"      text,
  "sizeBytes"     integer,
  "createdAt"     timestamptz not null default now()
);
create index if not exists "DocumentoEmpresa_empresaId_idx" on "DocumentoEmpresa"("empresaId");

alter table "DocumentoEmpresa" enable row level security;
drop policy if exists documentoempresa_tenant on "DocumentoEmpresa";
create policy documentoempresa_tenant on "DocumentoEmpresa"
  for all using ("workspaceId" in (select app_workspace_ids()));

notify pgrst, 'reload schema';
