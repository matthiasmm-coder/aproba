-- Citas por VIDEOLLAMADA (petición de Matthias 07/08/2026):
--   · videoProveedor — "meet" | "teams" | NULL (presencial)
--   · videoEnlace    — URL de la reunión (meet.google.com / teams.live.com|teams.microsoft.com)
-- El código tiene replis si estas columnas faltan (la invitación por email funciona
-- igualmente porque se envía con los datos del formulario; sin la migración solo se
-- pierde la persistencia al REABRIR la cita para editarla).
-- Idempotente.

ALTER TABLE "CitaPrevia" ADD COLUMN IF NOT EXISTS "videoProveedor" TEXT;
ALTER TABLE "CitaPrevia" ADD COLUMN IF NOT EXISTS "videoEnlace" TEXT;
