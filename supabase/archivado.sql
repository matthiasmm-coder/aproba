-- ─────────────────────────────────────────────────────────────────────────────
-- ARCHIVADO EN SERVIDOR — antes vivía en localStorage: con 3 usuarios/puestos del
-- mismo despacho, lo archivado divergía por navegador. Migración ADITIVA e
-- idempotente. Repli propre hasta migrar: la ruta devuelve error controlado y el
-- cliente sigue funcionando solo con localStorage.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Expediente" add column if not exists "archivadoAt" timestamptz;
