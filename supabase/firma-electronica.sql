-- FIRMA ELECTRÓNICA DE LOS DOCUMENTOS DEL EXPEDIENTE (Jennifer, 03/10/2026).
-- Un «sobre» = los documentos que UNA persona firma de una vez (hoja de encargo, mandato,
-- presupuesto): el PDF exacto que revisa (guardado y con su huella SHA-256), el código de un
-- solo uso que confirma la firma, y el rastro de pruebas (envío, apertura, código, firma, IP,
-- dispositivo). Lo escribe SOLO el servidor (service_role); el despacho lo lee bajo RLS.
-- Idempotente: se puede pegar varias veces.

create table if not exists "FirmaSobre" (
  "id"                 text        primary key,
  "workspaceId"        text        not null references "Workspace"("id") on delete cascade,
  "expedienteId"       text        not null references "Expediente"("id") on delete cascade,
  "clienteId"          text        references "Cliente"("id") on delete set null,
  "token"              text        not null unique,                 -- enlace de firma (secreto)
  "estado"             text        not null default 'PENDIENTE',    -- PENDIENTE | FIRMADO | ANULADO
  "documentos"         jsonb       not null default '[]'::jsonb,    -- [{doc, titulo, path, hash, paginas, caja, firmadoPath, firmadoHash, documentoId}]
  "firmanteNombre"     text,
  "firmanteEmail"      text,
  "firmanteDocumento"  text,
  "idioma"             text,
  "otpHash"            text,                                        -- código de un solo uso (huella, nunca en claro)
  "otpExpira"          timestamptz,
  "otpIntentos"        integer     not null default 0,
  "otpEnviados"        integer     not null default 0,
  "evidencias"         jsonb       not null default '[]'::jsonb,    -- [{evento, en, ip, dispositivo, detalle}]
  "creadoPor"          text,
  "enviadoAt"          timestamptz,
  "abiertoAt"          timestamptz,
  "firmadoAt"          timestamptz,
  "anuladoAt"          timestamptz,
  "recordatorios"      integer     not null default 0,
  "ultimoRecordatorio" timestamptz,
  "expiraAt"           timestamptz,
  "createdAt"          timestamptz not null default now(),
  "updatedAt"          timestamptz not null default now()
);
create index if not exists "FirmaSobre_expedienteId_idx" on "FirmaSobre" ("expedienteId");
create index if not exists "FirmaSobre_ws_estado_idx"    on "FirmaSobre" ("workspaceId", "estado");

alter table "FirmaSobre" enable row level security;
drop policy if exists firmasobre_tenant on "FirmaSobre";
create policy firmasobre_tenant on "FirmaSobre"
  for select using ("workspaceId" in (select app_workspace_ids()));

-- Comprobación: el editor de Supabase enseña el resultado de esta última consulta (0 filas).
select count(*) as sobres from "FirmaSobre";
