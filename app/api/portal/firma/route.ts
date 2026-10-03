import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { encargoActivoEfectivo } from "@/lib/facturacion-oficina";
import { ErrorFirma, crearSobres, type SobreFila } from "@/lib/firma/servicio";
import type { DocFirmable } from "@/lib/firma/sobre";

// «FIRMAR EN LÍNEA» desde el portal del cliente (lib/firma): abre — o retoma — el sobre de los
// documentos que el despacho pide firmar (hoja de encargo y/o mandato) y que aún no están
// firmados, y devuelve su enlace. Público por el token del portal; sin email no hay código.
export async function POST(req: Request) {
  let body: { token?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "peticion" }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "enlace" }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("Expediente").select("id, workspaceId, oficinaId, clienteId, cliente:Cliente(empresaId)").eq("portalToken", token).maybeSingle();
  const exp = data as { id: string; workspaceId: string; oficinaId: string | null; clienteId: string | null; cliente: { empresaId?: string | null } | { empresaId?: string | null }[] | null } | null;
  if (!exp) return NextResponse.json({ error: "enlace" }, { status: 404 });

  const activos = await encargoActivoEfectivo(admin, exp.workspaceId, exp.oficinaId);
  // Trabajador de una empresa: la hoja la firma la empresa; aquí, solo su mandato.
  const deEmpresa = Boolean((Array.isArray(exp.cliente) ? exp.cliente[0] : exp.cliente)?.empresaId);
  const { data: firmados } = await admin.from("Documento").select("tipo").eq("expedienteId", exp.id).eq("estado", "VALIDADO").in("tipo", ["HOJA_ENCARGO", "MANDATO"]);
  const hechos = new Set(((firmados ?? []) as { tipo: string }[]).map((d) => d.tipo));
  const docs: DocFirmable[] = [];
  if (activos.hoja && !deEmpresa && !hechos.has("HOJA_ENCARGO")) docs.push("hoja");
  if (activos.mandato && !hechos.has("MANDATO")) docs.push("mandato");
  if (!docs.length) return NextResponse.json({ error: "nada" }, { status: 409 });

  // Un sobre pendiente y vigente con esos mismos documentos: se retoma (mismo enlace).
  const { data: pend } = await admin.from("FirmaSobre").select("token, documentos, expiraAt, clienteId").eq("expedienteId", exp.id).eq("estado", "PENDIENTE");
  const vigente = ((pend ?? []) as Pick<SobreFila, "token" | "documentos" | "expiraAt" | "clienteId">[]).find((s) =>
    (!s.expiraAt || Date.parse(s.expiraAt) > Date.now()) && s.clienteId === exp.clienteId
    && docs.every((d) => s.documentos.some((x) => x.doc === d)));
  if (vigente) return NextResponse.json({ ok: true, token: vigente.token });

  try {
    const sobres = await crearSobres(admin, { expedienteId: exp.id, docs, creadoPor: null });
    const propio = sobres.find((s) => s.clienteId === exp.clienteId) ?? sobres[0];
    return NextResponse.json({ ok: true, token: propio.token });
  } catch (e) {
    if (e instanceof ErrorFirma) return NextResponse.json({ error: /email/i.test(e.message) ? "sin_email" : "firmar", detalle: e.message }, { status: e.status });
    console.error("[portal firma]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "firmar" }, { status: 500 });
  }
}
