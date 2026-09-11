-- WHATSAPP DEL DESPACHO (Meta Cloud API, «coexistencia» con la app WhatsApp Business) — 12/09/2026
--
-- Cada despacho conecta SU número (Embedded Signup de Meta, opción B decidida el 11/09):
-- el cliente sigue escribiendo al número de siempre; Aproba recibe cada mensaje y cada
-- foto por webhook y contesta en el mismo hilo. Nada de número «Aproba» intermedio.

create table if not exists "WhatsAppCuenta" (
  "id"             text        primary key,
  "workspaceId"    text        not null references "Workspace"("id") on delete cascade,
  "oficinaId"      text        references "Oficina"("id") on delete set null,   -- sede a la que pertenece el número (null = despacho)
  "wabaId"         text        not null,                 -- WhatsApp Business Account del despacho
  "phoneNumberId"  text        not null unique,          -- id del número en la Cloud API (clave de los webhooks)
  "telefono"       text,                                  -- número visible (display_phone_number)
  "nombreVerificado" text,                                -- verified_name en Meta
  "tokenCifrado"   text        not null,                 -- token de sistema del negocio (AES-256-GCM, lib/whatsapp-meta)
  "tokenExpiraAt"  timestamptz,                           -- null = no caduca
  "coexistencia"   boolean     not null default true,    -- onboarding desde la app WhatsApp Business
  "estado"         text        not null default 'CONECTADA', -- CONECTADA | DESCONECTADA | ERROR
  "error"          text,
  "plantillas"     jsonb       not null default '{}'::jsonb, -- nombre → APPROVED | PENDING | REJECTED
  "sincronizadoAt" timestamptz,                           -- contactos + historial pedidos (coexistencia, ventana 24 h)
  "createdAt"      timestamptz not null default now(),
  "updatedAt"      timestamptz not null default now()
);
create index if not exists "WhatsAppCuenta_workspaceId_idx" on "WhatsAppCuenta"("workspaceId");
alter table "WhatsAppCuenta" enable row level security;
drop policy if exists whatsappcuenta_tenant on "WhatsAppCuenta";
create policy whatsappcuenta_tenant on "WhatsAppCuenta"
  for select using ("workspaceId" in (select app_workspace_ids()));
-- (el token NUNCA se lee bajo sesión: solo service_role, y cifrado)

-- Registro de mensajes (entrantes, salientes, ecos de la app) — base de la conversación
-- y de la ventana de 24 h (texto libre vs plantilla). Idempotente por id de Meta.
create table if not exists "WhatsAppMensaje" (
  "id"             text        primary key,              -- wamid de Meta
  "workspaceId"    text        not null references "Workspace"("id") on delete cascade,
  "cuentaId"       text        not null references "WhatsAppCuenta"("id") on delete cascade,
  "clienteId"      text        references "Cliente"("id") on delete set null,
  "telefono"       text        not null,                 -- E.164 del cliente (sin «whatsapp:»)
  "direccion"      text        not null,                 -- IN (cliente → despacho) | OUT (Aproba → cliente) | ECO (despacho desde su app) | HIST (historial sincronizado)
  "tipo"           text        not null,                 -- text | image | document | audio | video | sticker | template | otro
  "texto"          text,
  "mediaId"        text,
  "mediaMime"      text,
  "nombreArchivo"  text,
  "estado"         text,                                  -- OUT: sent | delivered | read | failed
  "error"          text,
  "bandejaId"      text        references "BandejaEntrada"("id") on delete set null, -- fila de la bandeja si traía documentos
  "timestamp"      timestamptz not null,
  "createdAt"      timestamptz not null default now()
);
create index if not exists "WhatsAppMensaje_cuenta_tel_ts_idx" on "WhatsAppMensaje"("cuentaId", "telefono", "timestamp" desc);
create index if not exists "WhatsAppMensaje_cliente_idx" on "WhatsAppMensaje"("clienteId");
alter table "WhatsAppMensaje" enable row level security;
drop policy if exists whatsappmensaje_tenant on "WhatsAppMensaje";
create policy whatsappmensaje_tenant on "WhatsAppMensaje"
  for select using ("workspaceId" in (select app_workspace_ids()));

-- La bandeja de entrada (documentos que llegan sin pasar por la app) ya no es solo email.
alter table "BandejaEntrada" add column if not exists "canal"             text not null default 'email'; -- email | whatsapp
alter table "BandejaEntrada" add column if not exists "remitenteTelefono" text;                          -- E.164 (canal whatsapp)
-- "resendEmailId" (única) se reutiliza como id de origen: para WhatsApp guarda «wa:<wamid>».
