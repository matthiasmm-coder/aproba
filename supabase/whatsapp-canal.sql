-- Canal de los avisos al cliente, por workspace: EMAIL (statu quo) | WHATSAPP | AMBOS.
-- Lo honran todas las notificaciones al cliente de lib/notificaciones.ts; se elige en
-- Ajustes → Notificaciones al cliente. Idempotente.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "canalAvisos" TEXT NOT NULL DEFAULT 'EMAIL';
