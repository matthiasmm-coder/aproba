import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enviarConfirmacionCitaPrevia } from "@/lib/notificaciones";

// Citas previas (consulta): el gestor crea una cita con un cliente (existente o nombre
// libre). Todo bajo RLS (sesión): solo su workspace. Si la tabla no está migrada, el
// insert da error y se informa con un mensaje claro.

const ESTADOS = ["pendiente", "confirmada", "realizada", "cancelada"];

// Videollamada (petición Matthias 07/08): si viene videoProveedor, el email, la hora,
// la duración y un enlace VÁLIDO del proveedor son obligatorios — la invitación que
// recibe el cliente debe poder abrirse. El lugar se fuerza a «Videollamada».
type CuerpoCita = { clienteId?: string; nombre?: string; email?: string; telefono?: string; fecha?: string; hora?: string; duracion?: number; precio?: number; lugar?: string; motivo?: string; notas?: string; notificar?: boolean; videoProveedor?: string; videoEnlace?: string };
function validarVideo(body: CuerpoCita): { prov: "meet" | "teams" | null; enlace: string | null; error?: string } {
  const prov = body.videoProveedor === "meet" || body.videoProveedor === "teams" ? body.videoProveedor : null;
  if (!prov) return { prov: null, enlace: null };
  if (!String(body.email ?? "").trim()) return { prov, enlace: null, error: "Para una videollamada, el email del cliente es obligatorio." };
  if (!/^\d{2}:\d{2}$/.test(String(body.hora ?? "").trim())) return { prov, enlace: null, error: "Para una videollamada, la hora es obligatoria." };
  if (!Number.isFinite(body.duracion) || Number(body.duracion) <= 0) return { prov, enlace: null, error: "Para una videollamada, la duración es obligatoria." };
  const enlace = String(body.videoEnlace ?? "").trim();
  const valido = prov === "meet"
    ? /^https:\/\/meet\.google\.com\/[a-z0-9-]{6,}$/i.test(enlace)
    : /^https:\/\/(teams\.live\.com|teams\.microsoft\.com)\/\S+$/i.test(enlace);
  if (!valido) return { prov, enlace: null, error: prov === "meet" ? "El enlace debe ser una reunión de meet.google.com." : "El enlace debe ser una reunión de teams.live.com o teams.microsoft.com." };
  return { prov, enlace };
}

// Quita las columnas de videollamada del insert/update — repli pre-migración
// (supabase/cita-videollamada.sql): el guardado y la invitación funcionan igual,
// solo se pierde la persistencia de esos dos campos al reabrir la cita.
const sinVideo = <T extends { videoProveedor?: unknown; videoEnlace?: unknown }>(fila: T) => {
  const { videoProveedor: _vp, videoEnlace: _ve, ...resto } = fila;
  return resto;
};
const faltaColumnaVideo = (msg: string) => /videoProveedor|videoEnlace/i.test(msg);

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: CuerpoCita;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const nombre = (body.nombre ?? "").trim();
  const fecha = (body.fecha ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del cliente." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Falta la fecha de la cita." }, { status: 400 });
  const video = validarVideo(body);
  if (video.error) return NextResponse.json({ error: video.error }, { status: 400 });

  const { data: mem } = await supabase.from("Membership").select("workspaceId, Workspace(nombre)").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });
  const gestoria = (Array.isArray(mem.Workspace) ? mem.Workspace[0] : mem.Workspace)?.nombre ?? "Tu gestoría";

  const fila = {
    id: crypto.randomUUID(),
    workspaceId: mem.workspaceId as string,
    clienteId: body.clienteId?.trim() || null,
    nombre,
    email: body.email?.trim() || null,
    telefono: body.telefono?.trim() || null,
    fecha,
    hora: body.hora?.trim() || null,
    duracion: Number.isFinite(body.duracion) && Number(body.duracion) > 0 ? Math.round(Number(body.duracion)) : null,
    precio: Number.isFinite(body.precio) && Number(body.precio) >= 0 ? Number(body.precio) : null,
    lugar: video.prov ? "Videollamada" : (body.lugar?.trim() || null),
    motivo: body.motivo?.trim() || null,
    notas: body.notas?.trim() || null,
    estado: "confirmada",
    asignadoAId: user.id,
    videoProveedor: video.prov,
    videoEnlace: video.enlace,
  };

  let { error } = await supabase.from("CitaPrevia").insert(fila);
  if (error && faltaColumnaVideo(error.message)) ({ error } = await supabase.from("CitaPrevia").insert(sinVideo(fila)));
  if (error) {
    const falta = /relation .*CitaPrevia.* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/cita-previa.sql." : error.message }, { status: 500 });
  }

  let avisado = false;
  if (body.notificar && fila.email) {
    avisado = await enviarConfirmacionCitaPrevia({ nombre, email: fila.email, gestoria, fecha, hora: fila.hora, duracion: fila.duracion, precio: fila.precio, lugar: fila.lugar, motivo: fila.motivo, videoProveedor: video.prov, videoEnlace: video.enlace, citaId: fila.id });
  }
  return NextResponse.json({ ok: true, id: fila.id, avisado });
}

export async function PATCH(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { id?: string; estado?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const estado = (body.estado ?? "").trim();
  if (!id || !ESTADOS.includes(estado)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { error } = await supabase.from("CitaPrevia").update({ estado }).eq("id", id); // RLS: solo su workspace
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, estado });
}

// Una cita (para editar). RLS: solo si es del workspace del usuario.
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  const sel = (cols: string) => supabase.from("CitaPrevia").select(cols).eq("id", id).maybeSingle();
  let res = await sel("id, clienteId, nombre, email, telefono, fecha, hora, duracion, precio, lugar, motivo, notas, videoProveedor, videoEnlace");
  if (res.error) res = await sel("id, clienteId, nombre, email, telefono, fecha, hora, duracion, precio, lugar, motivo, notas");
  if (res.error) res = await sel("id, clienteId, nombre, email, telefono, fecha, hora, lugar, motivo, notas");
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  if (!res.data) return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  return NextResponse.json(res.data);
}

// Editar una cita.
export async function PUT(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: CuerpoCita & { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const nombre = (body.nombre ?? "").trim();
  const fecha = (body.fecha ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del cliente." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Falta la fecha de la cita." }, { status: 400 });
  const video = validarVideo(body);
  if (video.error) return NextResponse.json({ error: video.error }, { status: 400 });

  const patch = {
    clienteId: body.clienteId?.trim() || null,
    nombre,
    email: body.email?.trim() || null,
    telefono: body.telefono?.trim() || null,
    fecha,
    hora: body.hora?.trim() || null,
    duracion: Number.isFinite(body.duracion) && Number(body.duracion) > 0 ? Math.round(Number(body.duracion)) : null,
    precio: Number.isFinite(body.precio) && Number(body.precio) >= 0 ? Number(body.precio) : null,
    lugar: video.prov ? "Videollamada" : (body.lugar?.trim() || null),
    motivo: body.motivo?.trim() || null,
    notas: body.notas?.trim() || null,
    videoProveedor: video.prov,
    videoEnlace: video.enlace,
  };
  let { error } = await supabase.from("CitaPrevia").update(patch).eq("id", id); // RLS
  if (error && faltaColumnaVideo(error.message)) ({ error } = await supabase.from("CitaPrevia").update(sinVideo(patch)).eq("id", id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aviso opt-in al cliente con los DATOS NUEVOS (best-effort; nunca rompe el guardado).
  let avisado = false;
  if (body.notificar && patch.email) {
    const { data: mem } = await supabase.from("Membership").select("Workspace(nombre)").eq("userId", user.id).limit(1).maybeSingle();
    const gestoria = (Array.isArray(mem?.Workspace) ? mem?.Workspace[0] : mem?.Workspace)?.nombre ?? "Tu gestoría";
    avisado = await enviarConfirmacionCitaPrevia({ nombre, email: patch.email, gestoria, fecha, hora: patch.hora, duracion: patch.duracion, precio: patch.precio, lugar: patch.lugar, motivo: patch.motivo, actualizada: true, videoProveedor: video.prov, videoEnlace: video.enlace, citaId: id });
  }
  return NextResponse.json({ ok: true, avisado });
}

// Eliminar una cita.
export async function DELETE(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  let body: { id?: string } = {};
  try { body = await req.json(); } catch { /* permite ?id= */ }
  const id = (body.id ?? new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  const { error } = await supabase.from("CitaPrevia").delete().eq("id", id); // RLS
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
