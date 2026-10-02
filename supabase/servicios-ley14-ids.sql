-- ────────────────────────────────────────────────────────────────────────────────────
-- AJUSTES › SERVICIOS NO GUARDABA DESDE EL 01/10/2026 13:28 UTC — ids de servicios-ley14.sql
--
-- servicios-ley14.sql insertó sus filas con id 'svc_' || md5(...). El editor de Ajustes
-- (lib/config-browser · guardarServicios) hace upsert por PK con el id determinista
-- 'svc_<ws>_<clave>' (común) o 'svc_<ws>_<oficina>_<clave>' (sede): no encontraba la fila,
-- intentaba un INSERT y el índice único ServicioConfig_comun_clave / _oficina_clave lo
-- rechazaba (23505) → «Error al guardar — reintenta» y NADA del catálogo se guardaba.
-- Medido el 02/10: 109 filas (todas ley14_*), 19 despachos, 0 colisiones con un id
-- existente, ninguna FK apunta a ServicioConfig.id.
--
-- Solo cambia el id: el contenido de cada fila no se toca. Idempotente: se puede pegar
-- varias veces (la segunda vez actualiza 0 filas).
-- APLICADO en prod el 02/10/2026 (fila a fila por la API, mismo efecto): 109/109,
-- 423 filas antes y después, contenido idéntico, 0 ids no deterministas.
-- ────────────────────────────────────────────────────────────────────────────────────

update public."ServicioConfig"
set "id" = 'svc_' || "workspaceId" || '_' || coalesce("oficinaId" || '_', '') || "clave"
where "id" <> 'svc_' || "workspaceId" || '_' || coalesce("oficinaId" || '_', '') || "clave";

-- Comprobación (debe dar 0):
-- select count(*) from public."ServicioConfig"
-- where "id" <> 'svc_' || "workspaceId" || '_' || coalesce("oficinaId" || '_', '') || "clave";
