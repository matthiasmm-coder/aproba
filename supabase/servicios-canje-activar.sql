-- CANJE PARA TODOS (Matthias, 03/10/2026: «los canjes, disponibles para todos, salvo Juan»).
-- Activa «Canje de permiso de conducir» en los catálogos donde lo añadió la 1ª versión de
-- servicios-canje.sql (inactivo), con «precio a consultar»: sus clientes no ven un precio que
-- el despacho no ha elegido; cada despacho pone el suyo en Ajustes › Servicios.
-- Solo las filas que nadie ha tocado desde que se añadieron (12:50 UTC): si un despacho ya lo
-- activó, le puso precio o lo desactivó, se respeta. Juan no tiene esa fila (usa su propio
-- servicio de canje, activo): para él no cambia nada.
-- Idempotente: se puede pegar varias veces.

update public."ServicioConfig"
set "active" = true, "precioOculto" = true, "updatedAt" = now()
where "clave" = 'canje_permiso' and "active" = false and "updatedAt" < '2026-10-03 12:51:00';

-- Comprobación: el editor de Supabase enseña el resultado de esta última consulta.
select count(*) filter (where "active") as activos, count(*) filter (where "precioOculto") as a_consultar, count(*) as total
from public."ServicioConfig" where "clave" = 'canje_permiso';
