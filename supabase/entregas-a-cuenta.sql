-- ─────────────────────────────────────────────────────────────────────────────
-- ENTREGAS A CUENTA — pagos parciales sobre una factura.
--
-- Pedido por Gesadmbcn (17/08/2026): «ir anotando entregas a cuenta (50 € hoy,
-- 100 € la semana que viene) y que el saldo baje solo». En extranjería el cliente
-- paga a plazos y muchas veces en efectivo: hasta ahora una factura solo podía
-- estar PAGADA o no, así que ese dinero no se registraba en ninguna parte.
--
-- Decisiones:
--  · El saldo NO se guarda: se deduce de la suma de entregas (una sola verdad).
--    Guardar «pagado» en Factura obligaría a mantenerlo sincronizado en cada alta,
--    baja y anulación de entrega — la fuente clásica de descuadres.
--  · La factura pasa a PAGADA cuando las entregas cubren el total (lo hace el
--    servidor, no un trigger: el mismo camino que marcarFacturaPagada, que ya es
--    idempotente y dispara los avisos).
--  · Se permite registrar entregas sobre una factura EMITIDA o VENCIDA. Sobre una
--    ANULADA no (no hay deuda), y sobre una PAGADA tampoco (ya está saldada).
--
-- Migración aditiva e idempotente: ejecutar una vez en el editor SQL de Supabase.
-- Hasta entonces el código cae al comportamiento de siempre (todo o nada).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "EntregaCuenta" (
  "id"          text        primary key,
  "workspaceId" text        not null references "Workspace"("id") on delete cascade,
  "facturaId"   text        not null references "Factura"("id")   on delete cascade,
  "importe"     numeric(10,2) not null check ("importe" > 0),
  "fecha"       date        not null default (now() at time zone 'utc')::date,
  -- efectivo | transferencia | tarjeta | otro — informativo, para el arqueo del despacho
  "metodo"      text        not null default 'efectivo',
  "nota"        text,
  "creadoPor"   text        references "User"("id") on delete set null,
  "createdAt"   timestamptz not null default now()
);

create index if not exists "EntregaCuenta_facturaId_idx"   on "EntregaCuenta"("facturaId");
create index if not exists "EntregaCuenta_workspaceId_idx" on "EntregaCuenta"("workspaceId", "fecha");

-- RLS: mismo criterio que Factura — los miembros del despacho ven y registran las
-- entregas de SU workspace. Sin política para otros roles.
alter table "EntregaCuenta" enable row level security;

drop policy if exists entregacuenta_tenant_select on "EntregaCuenta";
create policy entregacuenta_tenant_select on "EntregaCuenta"
  for select using ("workspaceId" in (select app_workspace_ids()));

drop policy if exists entregacuenta_tenant_insert on "EntregaCuenta";
create policy entregacuenta_tenant_insert on "EntregaCuenta"
  for insert with check ("workspaceId" in (select app_workspace_ids()));

drop policy if exists entregacuenta_tenant_delete on "EntregaCuenta";
create policy entregacuenta_tenant_delete on "EntregaCuenta"
  for delete using ("workspaceId" in (select app_workspace_ids()));

-- Sin UPDATE a propósito: una entrega mal anotada se BORRA y se vuelve a crear.
-- Editar importes a posteriori enturbia el rastro de caja del despacho.
