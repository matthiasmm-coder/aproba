import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ASISTENTE_MODELO, ASISTENTE_SISTEMA } from "@/lib/asistente";

export const runtime = "nodejs";
export const maxDuration = 30;

// Asistente de soporte dentro del producto (primera capa de atención al cliente).
// Solo para usuarios autenticados. La conversación NO se guarda: se responde y punto.
const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

const MAX_MENSAJES = 12;
const MAX_LARGO = 2000;

// Freno básico por usuario (mismo lambda): evita que una pestaña abierta dispare cientos
// de llamadas. No es una defensa fuerte — es un tope de cortesía.
const ultimas = new Map<string, number[]>();
const LIMITE = 20; // peticiones
const VENTANA = 5 * 60 * 1000; // por 5 minutos

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  const ahora = Date.now();
  const previas = (ultimas.get(user.id) ?? []).filter((t) => ahora - t < VENTANA);
  if (previas.length >= LIMITE) return fail("Has hecho muchas preguntas seguidas. Espera un momento y vuelve a intentarlo.", 429);
  ultimas.set(user.id, [...previas, ahora]);

  const body = (await req.json().catch(() => ({}))) as { mensajes?: unknown; pagina?: unknown };
  const brutos = Array.isArray(body.mensajes) ? body.mensajes : [];
  const mensajes = brutos
    .slice(-MAX_MENSAJES)
    .map((m) => m as { rol?: unknown; texto?: unknown })
    .filter((m) => (m.rol === "user" || m.rol === "assistant") && typeof m.texto === "string" && (m.texto as string).trim())
    .map((m) => ({ role: m.rol as "user" | "assistant", content: (m.texto as string).trim().slice(0, MAX_LARGO) }));
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user") return fail("Falta la pregunta.");

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ texto: "El asistente no está disponible ahora mismo. Usa «Hablar con una persona» y te contestamos nosotros." });
  }

  // Dónde está el gestor: permite respuestas contextuales sin que tenga que explicarlo.
  const pagina = typeof body.pagina === "string" ? body.pagina.slice(0, 120) : "";
  const sistema = pagina ? `${ASISTENTE_SISTEMA}\n\nAhora mismo el usuario está en la página: ${pagina}` : ASISTENTE_SISTEMA;

  try {
    const res = await new Anthropic({ timeout: 25_000, maxRetries: 1 }).messages.create({
      model: ASISTENTE_MODELO,
      max_tokens: 700,
      system: sistema,
      messages: mensajes,
    });
    const texto = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!texto) throw new Error("respuesta vacía");
    return NextResponse.json({ texto });
  } catch (e) {
    console.error("[asistente]", e instanceof Error ? e.message : e);
    return fail("No he podido responder ahora mismo. Inténtalo de nuevo o usa «Hablar con una persona».", 502);
  }
}
