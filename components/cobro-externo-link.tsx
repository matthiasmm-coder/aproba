"use client";

import { useT } from "@/components/lang-provider";

// Puerta «¿Cobro fuera de la plataforma?» de la ficha de expediente (Server Component):
// dispara un evento que CobrosPanel escucha para abrir el popup de factura con «cobro
// externo» ya marcado — la factura nace PAGADA y no se le pide nada al cliente.
// (Antes esta puerta llevaba a /facturas/nueva, que pierde el vínculo con el expediente.)
export function CobroExternoLink() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("abrir-cobro-externo"))}
      className="inline-block py-2 font-semibold text-aproba-700 hover:underline sm:py-0"
    >
      {t("Regístralo aquí (factura ya pagada)")}
    </button>
  );
}
