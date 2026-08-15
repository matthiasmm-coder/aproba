-- ═══ MULTI-OFICINA · FACTURACIÓN POR SEDE (fase 6) ═══
-- Caso Gesadmbcn/Jennifer: dos oficinas = dos EMPRESAS distintas (NIF, cuenta,
-- serie de facturas). La oficina gana identidad fiscal propia; todo es opcional:
-- una oficina sin datos fiscales sigue facturando con los del despacho.

-- 1) Identidad fiscal de la oficina (encabezado de sus facturas y hoja de encargo)
alter table "Oficina" add column if not exists "razonSocial" text;
alter table "Oficina" add column if not exists "nif" text;
alter table "Oficina" add column if not exists "domicilio" text;
alter table "Oficina" add column if not exists "emailFacturacion" text;
-- Prefijo de la serie de facturas (p. ej. «DG» → DG-2026-0001). Vacío = serie común.
alter table "Oficina" add column if not exists "prefijoSerie" text;

-- 2) Cuenta bancaria por sede (null = común del despacho). El borrado de la oficina
--    NO borra la cuenta: vuelve a ser común (set null), nunca se pierde un IBAN.
alter table "CuentaBancaria" add column if not exists "oficinaId" text references "Oficina"(id) on delete set null;
create index if not exists "CuentaBancaria_oficina_idx" on "CuentaBancaria"("workspaceId", "oficinaId");

-- 3) Factura estampada con su sede (para emisor/cuenta correctos y filtros futuros).
alter table "Factura" add column if not exists "oficinaId" text references "Oficina"(id) on delete set null;
create index if not exists "Factura_oficina_idx" on "Factura"("workspaceId", "oficinaId");

-- 4) StripeCuenta: de UNA fila por despacho a una por (despacho, oficina).
--    La fila histórica (oficinaId null) queda como clave común del despacho.
alter table "StripeCuenta" add column if not exists "oficinaId" text references "Oficina"(id) on delete cascade;
alter table "StripeCuenta" add column if not exists id text;
update "StripeCuenta" set id = "workspaceId" where id is null; -- id sintético estable para las filas viejas
alter table "StripeCuenta" alter column id set default (gen_random_uuid())::text;
alter table "StripeCuenta" alter column id set not null;
alter table "StripeCuenta" drop constraint if exists "StripeCuenta_pkey";
alter table "StripeCuenta" add primary key (id);
-- Unicidad por ámbito (parciales: ON CONFLICT no las infiere → el código hace
-- select-then-write, nunca upsert).
create unique index if not exists "StripeCuenta_ws_comun"   on "StripeCuenta"("workspaceId") where "oficinaId" is null;
create unique index if not exists "StripeCuenta_ws_oficina" on "StripeCuenta"("workspaceId", "oficinaId") where "oficinaId" is not null;
