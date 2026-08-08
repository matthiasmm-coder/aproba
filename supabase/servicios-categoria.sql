-- Temas del catálogo (agosto 2026): agrupar servicios y packs por tema
-- («Empresa», «Nacionalidad», «Residencia»…) para que el portal del cliente no sea
-- una lista interminable — cada tema es un desplegable, plegado por defecto.
--
-- Texto LIBRE (como parentesco o estadoCivil): el despacho escribe sus propios temas,
-- sin enum ni tabla aparte. Vacío/NULL = «Otros trámites» (bloque final).
-- Los packs guardan su tema dentro de Workspace.packs (JSONB) — sin migración.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

ALTER TABLE "ServicioConfig" ADD COLUMN IF NOT EXISTS "categoria" TEXT;
