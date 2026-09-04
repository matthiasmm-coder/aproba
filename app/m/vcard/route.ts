import { vcard, CONTACTO } from "@/lib/contacto";

export const runtime = "nodejs";

// GET /m/vcard → descarga la ficha de contacto (.vcf). Lo abre iOS, Android y Outlook.
export async function GET() {
  return new Response(vcard(), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${CONTACTO.nombre.replace(/\s+/g, "-")}.vcf"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
