-- ─────────────────────────────────────────────────────────────────────────────
-- OPCIONAL (endurecimiento): garantiza UNA sola factura por (expediente, momento),
-- cerrando la carrera de doble emisión (dos "Solicitar pago final" simultáneos). La app
-- ya hace un check previo + maneja "yaExistia", así que la feature funciona sin esto;
-- este índice solo elimina el caso límite de concurrencia. Aditivo e idempotente.
--
-- Si falla por datos preexistentes, hay un expediente con 2 facturas del mismo momento;
-- revísalo antes (no debería ocurrir: el código ya impone la idempotencia).
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists "Factura_expediente_momento_key"
  on "Factura" ("expedienteId", "momento")
  where "momento" is not null;
