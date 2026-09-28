-- NOTIFICACIONES DE LA DEHú (Matthias, 28/09/2026).
--
-- Dos entradas, una sola bandeja (pestaña «DEHú»):
--   · PDF   — el gestor descarga de la DEHú las notificaciones que ya abrió (PDF o ZIP) y
--             las arrastra a Aproba, o las reenvía a su dirección de Aproba; la IA lee cada
--             una (tipo, persona, nº de expediente, plazo, documentos pedidos) y PROPONE su
--             expediente. Nada se escribe en un expediente sin que el gestor lo confirme.
--   · AVISO_EMAIL — el despacho añade su dirección de Aproba entre los avisos de la DEHú;
--             cada aviso de «notificación puesta a disposición» entra aquí con los 10 días
--             naturales para abrirla (art. 43.2 Ley 39/2015: pasados, se entiende rechazada).
-- Estados: PENDIENTE → VINCULADA (a su expediente) → GESTIONADA (requerimiento creado,
-- resolución o cita registradas, aviso abierto) o IGNORADA.
--
-- Escritura SOLO por las rutas de la API (service role, tras comprobar el despacho bajo
-- sesión); lectura bajo RLS. Idempotente: se puede ejecutar dos veces.

create table if not exists "NotificacionDehu" (
  "id" text primary key,
  "workspaceId" text not null references "Workspace"("id") on delete cascade,
  "origen" text not null check ("origen" in ('PDF', 'AVISO_EMAIL')),
  "estado" text not null default 'PENDIENTE' check ("estado" in ('PENDIENTE', 'VINCULADA', 'GESTIONADA', 'IGNORADA')),
  "tipo" text not null default 'OTRA',
  "organismo" text,
  "asunto" text,
  "resumen" text,
  "titularNombre" text,
  "nie" text,
  "pasaporte" text,
  "numeroExpediente" text,
  "fechaActo" date,
  "fechaNotificacion" date,
  "fechaPuestaDisposicion" date,
  "plazo" integer,
  "plazoTipo" text check ("plazoTipo" is null or "plazoTipo" in ('HABILES', 'NATURALES', 'MESES')),
  "fechaLimite" timestamptz,
  "documentos" text[] not null default '{}',
  "tasas" jsonb,
  "storagePath" text,
  "nombreArchivo" text,
  "sizeBytes" integer,
  "huella" text,
  "expedienteId" text references "Expediente"("id") on delete set null,
  "clienteId" text references "Cliente"("id") on delete set null,
  "expedienteSugeridoId" text references "Expediente"("id") on delete set null,
  "motivoSugerencia" text,
  "requerimientoId" text references "Requerimiento"("id") on delete set null,
  "iaDatos" jsonb,
  "aviso" jsonb,
  "confianza" real,
  "creadoPorId" text,
  "gestionadaPor" text,
  "gestionadaAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "NotificacionDehu_ws_estado" on "NotificacionDehu" ("workspaceId", "estado");
create index if not exists "NotificacionDehu_ws_creada" on "NotificacionDehu" ("workspaceId", "createdAt" desc);
create index if not exists "NotificacionDehu_expediente" on "NotificacionDehu" ("expedienteId") where "expedienteId" is not null;
-- El mismo PDF (o el mismo email de aviso) dos veces no crea dos notificaciones.
create unique index if not exists "NotificacionDehu_ws_huella" on "NotificacionDehu" ("workspaceId", "huella") where "huella" is not null;

-- Lectura: miembros del despacho. Una notificación ya vinculada sigue la visibilidad de su
-- expediente (sedes, asistentes): la subconsulta a "Expediente" aplica SU política. Las
-- que aún no tienen expediente las ven todos los miembros (la regla de las filas sin sede).
alter table "NotificacionDehu" enable row level security;
drop policy if exists notificaciondehu_tenant_select on "NotificacionDehu";
create policy notificaciondehu_tenant_select on "NotificacionDehu"
  for select using (
    "workspaceId" in (select app_workspace_ids())
    and ("expedienteId" is null or "expedienteId" in (select id from "Expediente"))
  );

-- Bucket de ENTRADA (privado) para lo que el gestor sube en la pestaña DEHú: un ZIP de la
-- DEHú no cabe en "documentos" (solo PDF e imágenes, 8 MB). Aquí los archivos solo están de
-- paso: se abren, se leen, su PDF queda en "documentos" y la entrada se borra. Sin
-- políticas: solo escriben las URL firmadas que da la API y solo lee el servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dehu-entrada', 'dehu-entrada', false, 26214400,
        array['application/zip', 'application/x-zip-compressed', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Comprobación: debe devolver 0 y una fila «dehu-entrada», sin errores.
-- select count(*) from "NotificacionDehu";
-- select id, public, file_size_limit from storage.buckets where id = 'dehu-entrada';
