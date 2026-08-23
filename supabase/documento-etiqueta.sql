-- Etiqueta EXACTA de la casilla a la que pertenece un documento.
-- Motivo (23/08/2026): dos documentos pedidos a mano («Certificado médico oficial»
-- y «Foto tamaño carnet») caen los dos en el tipo técnico OTRO. Sin esta columna:
--   · el portal marcaba las DOS casillas al enviar UNA sola,
--   · y la segunda subida REUTILIZABA la fila de la primera (fichero perdido).
-- Con la etiqueta, cada casilla tiene su documento. Los tipos conocidos siguen
-- casando por tipo (y las filas antiguas, sin etiqueta, también).
alter table "Documento" add column if not exists "etiqueta" text;
