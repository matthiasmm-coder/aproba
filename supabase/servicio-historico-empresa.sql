-- Historial importado de una EMPRESA cliente directa (25/09/2026).
--
-- Por qué: Luis (Asenjo) factura consultas e informes a empresas que no tienen ningún
-- trabajador en el despacho (Hervás Abogados, SYG Auditores…). La migración creaba la
-- empresa pero no podía guardar esas facturas: el historial solo admitía una persona.
-- Ahora el titular del historial es un cliente O una empresa (al menos uno de los dos).
--
-- Idempotente: se puede ejecutar dos veces sin error.

alter table "ServicioHistorico" add column if not exists "empresaId" text references "Empresa"("id") on delete cascade;
alter table "ServicioHistorico" alter column "clienteId" drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ServicioHistorico_titular_check') then
    alter table "ServicioHistorico" add constraint "ServicioHistorico_titular_check"
      check ("clienteId" is not null or "empresaId" is not null);
  end if;
end $$;

create index if not exists "ServicioHistorico_empresaId_idx" on "ServicioHistorico"("empresaId");

-- La RLS existente (serviciohistorico_tenant, por workspaceId) cubre también estas filas.
-- Que la API vea ya la nueva relación ServicioHistorico → Empresa:
notify pgrst, 'reload schema';
