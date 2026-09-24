-- ─────────────────────────────────────────────────────────────────────────────────────
-- ESTADO EN EXTRANJERÍA — Matthias, 24/09/2026 (a raíz de Jennifer: «mirar si se puede
-- revisar directamente»)
--
-- Lo que dijo la Administración la ÚLTIMA vez que el gestor consultó el expediente
-- (infoext2), con la fecha de esa consulta. Hoy solo «EN_TRAMITE»: la resolución se
-- registra como salida (concedido / denegado) y el requerimiento en su propia tabla.
-- La consulta la hace el gestor en la web oficial (captcha): Aproba no consulta sola.
-- ─────────────────────────────────────────────────────────────────────────────────────

alter table "Expediente" add column if not exists "estadoExtranjeria" text;
alter table "Expediente" add column if not exists "estadoExtranjeriaAt" timestamptz;

alter table "Expediente" drop constraint if exists "Expediente_estadoExtranjeria_check";
alter table "Expediente" add constraint "Expediente_estadoExtranjeria_check"
  check ("estadoExtranjeria" is null or "estadoExtranjeria" in ('EN_TRAMITE'));
