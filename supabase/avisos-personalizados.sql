-- ════════════════════════════════════════════════════════════════════════════
-- AVISOS PERSONALIZADOS + OCULTAR PREDETERMINADOS
-- Pedido por Sandra (LexPats) el 31/08/2026, día de su alta.
--
-- Qué añade:
--   · eventoBase — un aviso PERSONALIZADO se dispara con el mismo evento real que
--     uno predeterminado (doc_validado, presentado, cita_cliente…). Esta columna
--     guarda ese vínculo; los predeterminados la llevan a NULL.
--   · oculto — «eliminar» un aviso predeterminado no borra la fila (volvería a
--     aparecer por el repli a DEFAULT_AVISOS): lo marca oculto. No se muestra en
--     Ajustes ni se envía, y se puede restaurar.
--
-- Ejecutar UNA vez en Supabase → SQL editor. Reejecutable sin peligro (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════

alter table "AvisoConfig" add column if not exists "eventoBase" text;
alter table "AvisoConfig" add column if not exists "oculto" boolean not null default false;

-- Consulta del despachador: avisos personalizados de un evento, por ámbito.
create index if not exists "AvisoConfig_eventoBase_idx"
  on "AvisoConfig"("workspaceId", "eventoBase") where "eventoBase" is not null;
