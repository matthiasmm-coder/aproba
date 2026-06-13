// URL base pública de la aplicación, para construir enlaces absolutos
// (URLs de retorno de Stripe, enlaces en correos, etc.).
//
// En producción se fija NEXT_PUBLIC_APP_URL = https://aproba-software.com.
// Si no está definida, se deduce del origen de la petición (correcto cuando
// se accede por el dominio real; útil en local y en previews de Vercel).
export function baseUrlFromRequest(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return configured || new URL(req.url).origin;
}
