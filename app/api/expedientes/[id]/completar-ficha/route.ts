import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { esDocumentoDeIdentidad, fichaDesdeCampos, huecosDeFicha } from "@/lib/ficha-extraccion";
import { FICHA_CAMPOS, FICHA_KEYS } from "@/lib/ficha";

// «Rellenar con los documentos»: vuelca a la ficha de cada persona lo que la IA ya leyó en
// sus documentos de identidad de ESTE expediente. Desde el 08/09/2026 la subida lo hace
// sola; esto recupera los expedientes ANTERIORES, donde los datos se quedaron en el
// expediente y la ficha siguió vacía (queja de Asenjo Global Consulting).
//
// Misma regla que en la subida: solo se rellena lo VACÍO — lo que escribió una persona no
// se pisa nunca — y queda constancia en el historial. Lo dispara el gestor, no un cron:
// nada se reescribe a espaldas de nadie.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS: solo resuelve si el expediente es del workspace del usuario (anti-IDOR).
  const { data: exp } = await supa.from("Expediente").select("id, clienteId").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  const titular = (exp as { clienteId: string | null }).clienteId;

  const admin = createSupabaseAdmin();
  const { data: docs } = await admin.from("Documento").select("id, clienteId, estado").eq("expedienteId", id).eq("estado", "VALIDADO");
  if (!docs?.length) return NextResponse.json({ ok: true, personas: [], rellenados: 0 });

  const { data: exts } = await admin.from("Extraction").select("documentoId, tipoDetectado, datos").in("documentoId", docs.map((d) => d.id));
  const porDoc = new Map((exts ?? []).map((x) => [x.documentoId, x]));

  // Un documento pertenece a su miembro (familia) o, si no lo dice, al titular.
  const personas: { nombre: string; campos: string[] }[] = [];
  let rellenados = 0;
  const vistos = new Set<string>();
  for (const d of docs) {
    const x = porDoc.get(d.id);
    if (!x || !esDocumentoDeIdentidad(x.tipoDetectado)) continue;
    const dueno = (d as { clienteId: string | null }).clienteId || titular;
    if (!dueno || vistos.has(dueno)) continue;

    // Todos los documentos de identidad de esa persona, no solo el primero (el pasaporte
    // trae la identidad y la TIE el NIE: juntos completan la ficha).
    const suyos = docs.filter((o) => ((o as { clienteId: string | null }).clienteId || titular) === dueno);
    const campos = suyos.flatMap((o) => {
      const e = porDoc.get(o.id);
      return e && esDocumentoDeIdentidad(e.tipoDetectado) && Array.isArray(e.datos) ? (e.datos as { label: string; value: string }[]) : [];
    });
    if (!campos.length) continue;
    vistos.add(dueno);

    const { data: filaRaw } = await admin.from("Cliente").select(["nombre", "apellidos", ...FICHA_KEYS].join(", ")).eq("id", dueno).maybeSingle();
    const fila = filaRaw as unknown as Record<string, unknown> | null;
    if (!fila) continue;
    const huecos = huecosDeFicha(fila, fichaDesdeCampos(campos));
    const claves = Object.keys(huecos);
    if (!claves.length) continue;

    const { error } = await admin.from("Cliente").update(huecos).eq("id", dueno);
    if (error) { console.warn("[completar-ficha]", error.message); continue; }
    const etiquetas = claves.map((k) => FICHA_CAMPOS.find((c) => c.k === k)?.label ?? k);
    const quien = `${String(fila.nombre ?? "")} ${String(fila.apellidos ?? "")}`.trim() || "el cliente";
    rellenados += claves.length;
    personas.push({ nombre: quien, campos: etiquetas });
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(), expedienteId: id, tipo: "DOC_VALIDADO",
      descripcion: `Ficha de ${quien} completada con los documentos: ${etiquetas.join(", ")}`,
    });
  }

  return NextResponse.json({ ok: true, personas, rellenados });
}
