-- ────────────────────────────────────────────────────────────────────────────────────
-- LEY 14/2013 EN EL CATÁLOGO DE CADA DESPACHO (01/10/2026) — GENERADO por
-- scripts/generar-sql-ley14.ts desde lib/servicios.ts: no editar a mano.
--
-- Los despachos creados a partir de hoy reciben estos servicios por defecto. Los que ya
-- tienen catálogo propio (filas en ServicioConfig) los reciben aquí, INACTIVOS: aparecen
-- en Ajustes › Servicios, carpeta «Movilidad internacional», y cada despacho activa los que lleve.
-- En cada ámbito (gestoría y oficinas con catálogo propio) que aún no los tenga.
--
-- Idempotente: se puede pegar varias veces.
-- ────────────────────────────────────────────────────────────────────────────────────

with ambitos as (
  select "workspaceId", "oficinaId", coalesce(max("orden"), 0) as orden_max
  from public."ServicioConfig"
  group by "workspaceId", "oficinaId"
), nuevos (clave, label, descripcion, docs, anticipo, resto, cita, quien, suplidos, pos) as (
  values
    ('ley14_cualificado', 'Profesional altamente cualificado (Ley 14/2013)', 'Residencia para directivos, técnicos y profesionales cualificados (también Tarjeta azul UE)', array['Pasaporte completo (todas las páginas)', 'Título universitario o acreditación de experiencia', 'Currículum vitae', 'Contrato de trabajo firmado', 'Seguro médico', 'Antecedentes penales (últimos 2 años)']::text[], 450, 450, true, 'cliente', '[{"concepto":"Tasa 790-038","importe":73.26}]'::jsonb, 1),
    ('ley14_traslado', 'Traslado intraempresarial (Ley 14/2013)', 'Residencia para un trabajador desplazado dentro de su grupo de empresas (ICT)', array['Pasaporte completo (todas las páginas)', 'Título o acreditación de 3 años de experiencia', 'Currículum vitae', 'Carta de traslado de la empresa, firmada por el trabajador', 'Tres últimas nóminas con el grupo', 'Certificado de cobertura de Seguridad Social o seguro médico', 'Antecedentes penales (últimos 2 años)']::text[], 450, 450, true, 'cliente', '[{"concepto":"Tasa 790-038","importe":73.26}]'::jsonb, 2),
    ('ley14_teletrabajo', 'Teletrabajador internacional · nómada digital (Ley 14/2013)', 'Residencia para trabajar en remoto desde España para empresas de fuera', array['Pasaporte completo (todas las páginas)', 'Contrato con la empresa (3 meses o más)', 'Carta de la empresa: funciones, teletrabajo y sueldo', 'Certificado del registro mercantil de la empresa', 'Nóminas o facturas de los últimos 3 meses', 'Certificado bancario de los últimos 3 meses', 'Título o acreditación de 3 años de experiencia', 'Seguro médico sin copagos ni carencias', 'Antecedentes penales (últimos 2 años)']::text[], 450, 450, true, 'cliente', '[{"concepto":"Tasa 790-038","importe":73.26}]'::jsonb, 3),
    ('ley14_emprendedor', 'Emprendedor (Ley 14/2013)', 'Residencia para un proyecto empresarial innovador, con informe de ENISA', array['Pasaporte completo (todas las páginas)', 'Plan de negocio para ENISA', 'Acreditación de medios económicos', 'Seguro médico sin carencias', 'Antecedentes penales (últimos 2 años)']::text[], 450, 450, true, 'cliente', '[{"concepto":"Tasa 790-038","importe":73.26}]'::jsonb, 4),
    ('ley14_renovacion', 'Renovación Ley 14/2013', 'Renovar una autorización de movilidad internacional (2 años más)', array['Pasaporte completo (todas las páginas)', 'TIE actual', 'Documentación que acredite que se mantienen los requisitos', 'Seguro médico']::text[], 225, 225, true, 'cliente', '[{"concepto":"Tasa 790-038 (renovación)","importe":78.67}]'::jsonb, 5)
)
insert into public."ServicioConfig" (
  "id", "workspaceId", "oficinaId", "clave", "label", "descripcion", "docs", "active",
  "anticipo", "resto", "citaPresencial", "citaQuien", "suplidos", "categoria", "temaId", "orden", "updatedAt"
)
select
  -- El MISMO id que escribe Ajustes (lib/config-browser): con un md5, el editor no
  -- encontraba la fila y su guardado chocaba con el índice único por clave (02/10/2026).
  'svc_' || a."workspaceId" || '_' || coalesce(a."oficinaId" || '_', '') || n.clave,
  a."workspaceId", a."oficinaId", n.clave, n.label, n.descripcion, n.docs, false,
  n.anticipo, n.resto, n.cita, n.quien, n.suplidos, 'Movilidad internacional',
  -- Carpeta solo donde hay árbol (el update de abajo la crea); sin árbol, manda «categoria».
  case when w."temas" is not null and jsonb_array_length(w."temas") > 0
       then 'tema_' || md5(a."workspaceId" || '|' || 'Movilidad internacional') end,
  a.orden_max + n.pos, now()
from ambitos a
join public."Workspace" w on w."id" = a."workspaceId"
cross join nuevos n
where not exists (
  select 1 from public."ServicioConfig" s
  where s."workspaceId" = a."workspaceId"
    and s."oficinaId" is not distinct from a."oficinaId"
    and s."clave" = n.clave
);

-- La carpeta, en el árbol de los despachos que ya tienen carpetas (los demás agrupan por
-- «categoria»): al final, a la raíz, visible para todo el equipo.
update public."Workspace" w
set "temas" = w."temas" || jsonb_build_array(jsonb_build_object(
  'id', 'tema_' || md5(w."id" || '|' || 'Movilidad internacional'),
  'nombre', 'Movilidad internacional',
  'parentId', null,
  'orden', coalesce((select max((t->>'orden')::int) from jsonb_array_elements(w."temas") t), 0) + 1,
  'usuarios', '[]'::jsonb
))
where w."temas" is not null and jsonb_array_length(w."temas") > 0
  and not exists (
    select 1 from jsonb_array_elements(w."temas") t
    where t->>'id' = 'tema_' || md5(w."id" || '|' || 'Movilidad internacional')
  );

-- Comprobación:
-- select "clave", count(*) from public."ServicioConfig" where "clave" like 'ley14_%' group by 1 order by 1;
