-- Modo de trabajo del expediente (22/08/2026).
-- 'portal'  → el cliente recibe un enlace y sube sus datos y documentos (por defecto).
-- 'manual'  → el despacho lo trabaja internamente: NO se pide el enlace por ninguna
--             parte (ni tarjeta del tablero, ni ficha, ni recordatorios al cliente).
-- NULL = 'portal': todos los expedientes existentes conservan su comportamiento.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "modoTrabajo" text;
