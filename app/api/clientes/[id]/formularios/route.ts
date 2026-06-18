import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { datosDeCliente } from "@/lib/formularios";
import { rellenarOficial } from "@/lib/ex-forms";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

const nombreArchivo = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");
// Toutes les colonnes « ficha » du cliente (mêmes champs que le portail « Tus datos »).
const SELECT = "nombre, apellidos, email, telefono, nacionalidad, numeroDocumento, sexo, fechaNacimiento, lugarNacimiento, paisNacimiento, estadoCivil, via, numeroVia, piso, codigoPostal, provincia, municipio, nombrePadre, nombreMadre";

// GET ?tipo=EX-10 → PDF officiel AUTORRELLENÉ depuis la fiche du client, sans
// expediente ni service (RLS : seul un membre du workspace du client y accède).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tipo = new URL(req.url).searchParams.get("tipo") ?? "";

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: cli } = await supabase.from("Cliente").select(SELECT).eq("id", id).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const c = cli as Record<string, string | null>;
  const ficha: Record<string, string> = {};
  for (const k of FICHA_KEYS) { const v = c[k]; if (typeof v === "string" && v) ficha[k] = v; }
  const nombreCompleto = `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim();

  const pdf = await rellenarOficial(tipo, datosDeCliente(ficha as ClienteFicha, nombreCompleto, c.telefono, c.email));
  if (!pdf) return NextResponse.json({ error: "Formulario oficial no disponible para este modelo." }, { status: 404 });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivo(tipo)}_${nombreArchivo(nombreCompleto || "cliente")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
