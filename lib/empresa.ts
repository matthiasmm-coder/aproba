// CLIENTE-EMPRESA — constantes y helpers puros (sin I/O), como lib/familia.ts.
//
// La empresa es quien CONTRATA y PAGA: factura, hoja de encargo y presupuesto salen a su
// nombre (razón social + CIF + domicilio fiscal). El TRABAJADOR sigue siendo una persona
// con su ficha: portal, documentos, formularios EX y tasas son suyos. Petición de Asenjo
// Global Consulting (08/09/2026): «el gestor hace un dossier para un migrante, pero su
// cliente es la empresa que lo va a contratar».

import type { ClienteDatosFactura } from "@/lib/facturas";

export type EmpresaFiscal = {
  razonSocial?: string | null; nif?: string | null;
  domicilio?: string | null; codigoPostal?: string | null; municipio?: string | null; provincia?: string | null;
  contactoNombre?: string | null; contactoEmail?: string | null; contactoTelefono?: string | null;
};

const t = (v: unknown) => String(v ?? "").trim();

export const nombreEmpresa = (e: EmpresaFiscal | null | undefined) => t(e?.razonSocial) || "Empresa";

// CIF español: letra + 7 dígitos + dígito/letra de control. Solo se normaliza (espacios,
// guiones, mayúsculas); no se valida el control — un CIF extranjero también es un cliente.
export const normalizaNif = (v: unknown) => t(v).toUpperCase().replace(/[\s.\-]/g, "");

// Snapshot fiscal para la factura — misma forma que datosFiscalesDeCliente (lib/facturas):
// el documento identifica al emisor de la obligación (CIF) y la dirección es la fiscal.
export function datosFiscalesDeEmpresa(e: EmpresaFiscal | null | undefined): ClienteDatosFactura | null {
  if (!e) return null;
  const nif = normalizaNif(e.nif);
  const documento = nif ? `CIF/NIF ${nif}` : "";
  const prov = t(e.provincia) && t(e.provincia).toLowerCase() !== t(e.municipio).toLowerCase() ? ` (${t(e.provincia)})` : "";
  const localidad = [t(e.codigoPostal), t(e.municipio)].filter(Boolean).join(" ") + prov;
  const direccion = [t(e.domicilio), localidad.trim()].filter(Boolean).join(" · ");
  if (!documento && !direccion) return null;
  return { ...(documento ? { documento } : {}), ...(direccion ? { direccion } : {}) };
}

// Bloque «cliente» de la hoja de encargo / presupuesto cuando el cliente es una empresa:
// razón social en «nombre», CIF donde iría el NIE, contacto de la empresa.
export function clienteEncargoDeEmpresa(e: EmpresaFiscal) {
  return {
    nombre: t(e.razonSocial), apellidos: "", nie: normalizaNif(e.nif), pasaporte: "", nacionalidad: "",
    domicilio: t(e.domicilio), municipio: t(e.municipio), cp: t(e.codigoPostal), provincia: t(e.provincia),
    telefono: t(e.contactoTelefono), email: t(e.contactoEmail),
  };
}
