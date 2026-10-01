import { ARTICULOS, listaArticulos } from "@/lib/articulos";
import { FRASE_DEFINICION, PRECIOS } from "@/lib/paginas";
import { TODAS_LAS_PAGINAS as PAGINAS } from "@/lib/paginas-indice";

// /llms.txt — el índice que leen los asistentes y buscadores generativos (convención
// llmstxt.org): qué es Aproba, en una frase idéntica a la del sitio, y dónde está cada
// cosa. Estático: se genera en build desde las mismas fuentes que el sitemap.
export const dynamic = "force-static";
const BASE = "https://aproba-software.com";

export function GET() {
  const paginas = PAGINAS.map((p) => `- [${p.h1}](${BASE}${p.ruta}): ${p.descripcion}`).join("\n");
  const articulos = listaArticulos().map((a) => `- [${a.titulo}](${BASE}/articulos/${a.slug}): ${a.descripcion}`).join("\n");
  const cuerpo = `# Aproba

> ${FRASE_DEFINICION}

Aproba es un producto de ExpatfrancesCKNA07 S.L. (Malgrat de Mar, Barcelona, España), en producción desde 2026, para gestorías administrativas y abogados de extranjería en España. Cubre el régimen general (RD 1155/2024: Oficinas de Extranjería, Mercurio) y la movilidad internacional de la Ley 14/2013 (UGE-CE: profesionales altamente cualificados, traslados intraempresariales, teletrabajadores internacionales y emprendedores, con los modelos MI-T, MI-F y MI-TIE). Los clientes finales (personas extranjeras) usan un portal en 8 idiomas sin instalar nada. Los datos se alojan en la Unión Europea y no se usan para entrenar modelos de IA.

Precios (sin IVA, sin permanencia, ${PRECIOS.pruebaDias} días de prueba sin tarjeta): Starter ${PRECIOS.starter.mes} €/mes (${PRECIOS.starter.expedientes} expedientes al mes), Pro ${PRECIOS.pro.mes} €/mes (${PRECIOS.pro.expedientes} expedientes, facturación integrada), Business desde ${PRECIOS.business.mes} €/mes (ilimitado, ${PRECIOS.business.oficinas} oficinas incluidas, +${PRECIOS.business.oficinaExtra} €/mes por oficina adicional). Expediente adicional: ${PRECIOS.expedienteExtra} €. Migración de datos hecha por el equipo de Aproba: gratis para todos los despachos, en 48 horas. Servicio de puesta en marcha «Despegue» (configuración de la cuenta, formación, soporte individual de por vida con respuesta en menos de 24 horas y personalización de funcionalidades) desde ${PRECIOS.despegueDesde} €.

## Producto

${paginas}

## Artículos (${ARTICULOS.length}, con fuentes oficiales y fecha)

${articulos}

## Legal

- [Aviso legal](${BASE}/legal/aviso-legal)
- [Política de privacidad](${BASE}/legal/privacidad): incluye la lista de subencargados
- [Contrato de encargado del tratamiento (DPA)](${BASE}/legal/dpa)
- [Términos y condiciones](${BASE}/legal/terminos)

## Contacto

- Email: aproba.software@gmail.com
- Prueba gratuita: ${BASE}/signup?modo=prueba
`;
  return new Response(cuerpo, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
