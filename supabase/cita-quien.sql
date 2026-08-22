-- Cita del expediente: quién acude (22/08/2026).
-- Antes «quién acude» era un ajuste DEL SERVICIO (ServicioConfig.citaQuien); ahora el
-- gestor lo fija POR CITA en la ficha (cliente / gestor / ambos) y el servicio queda
-- como valor por defecto. El código es fail-soft: sin esta columna todo sigue
-- funcionando con el valor derivado del servicio.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "citaQuien" text;
