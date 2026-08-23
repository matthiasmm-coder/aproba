-- Documentos que se piden en UN expediente concreto, además de los del servicio.
-- Motivo (23/08/2026): 31 de 144 expedientes reales no tenían NINGÚN documento
-- esperado — 22 con tipo OTRO sin servicio y 9 con un servicio propio del despacho
-- creado sin lista de documentos. El gestor abría la ficha y no sabía qué reunir.
-- Aquí se guarda lo que el gestor añade a mano; se une (dedup) a los del servicio
-- y alimenta IGUAL la ficha, el portal del cliente, el progreso y el recordatorio.
alter table "Expediente" add column if not exists "docsExtra" text[];
