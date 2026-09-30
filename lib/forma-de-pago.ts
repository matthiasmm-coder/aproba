import { fmtIban } from "@/lib/iban";
import type { Factura } from "@/lib/facturas";

// Pie «Forma de pago» de la factura impresa (Matthias, 30/09/2026). Antes decía «transferencia»
// EN DURO: sin IBAN, en despachos sin cuenta y hasta en facturas cobradas con tarjeta. Ahora:
//  • cobrada con tarjeta o en efectivo → ese método (el IBAN haría creer en una transferencia);
//  • si no, la transferencia con el IBAN REAL de quien emite (lib/facturacion-oficina.ts,
//    cuentaParaOficina); sin IBAN, nada;
//  • nada en una anulada, una rectificativa (el dinero va al cliente, no al despacho) o una
//    factura sin nada que pagar.
// `metodoPago` solo es un HECHO en una factura PAGADA: al crearla, varias vías lo dejan en
// TRANSFERENCIA por defecto (citas, familias, fraccionar, pagos).
export type FormaDePago = { metodo: "Tarjeta" | "Efectivo" | "Transferencia"; iban: string | null } | null;

export function formaDePago(
  f: Pick<Factura, "estado" | "metodoPago" | "rectificaId" | "rectificaNumero">,
  aPagar: number,
  iban: string | null | undefined,
): FormaDePago {
  if (f.estado === "ANULADA" || f.rectificaId || f.rectificaNumero || !(aPagar > 0)) return null;
  const hecho = f.estado === "PAGADA" ? String(f.metodoPago ?? "").toUpperCase() : "";
  if (hecho === "TARJETA") return { metodo: "Tarjeta", iban: null };
  if (hecho === "EFECTIVO") return { metodo: "Efectivo", iban: null };
  if (hecho === "OTRO") return null;
  const limpio = String(iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (limpio) return { metodo: "Transferencia", iban: fmtIban(limpio) };
  return hecho === "TRANSFERENCIA" ? { metodo: "Transferencia", iban: null } : null;
}
