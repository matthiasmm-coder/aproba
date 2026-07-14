-- ─────────────────────────────────────────────────────────────────────────────
-- ARCHIVAR FACTURAS — el gestor puede archivar una factura para sacarla de la
-- lista de trabajo (y de los cobros pendientes) SIN borrarla: la factura sigue
-- existiendo (documento contable) pero deja de ensuciar la vista y de generar
-- recordatorios. Migración ADITIVA e idempotente. Repli propre hasta migrar:
-- las rutas devuelven un error controlado y la lista funciona sin la columna.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Factura" add column if not exists "archivadoAt" timestamptz;
