// Memoria de actividad (art. 8.1.f de la Orden ISM/164/2026): las entidades inscritas
// en el Registro de Colaboradores de Extranjería la aportan al renovar su inscripción.
// Se prueba lo que hace daño si falla: que el expediente nuevo SUME en el período de
// hoy, que NO aparezca en un período pasado, que el PDF sea un PDF, y que un rango
// absurdo o una sesión ausente se corten antes de tocar la base.
import { contexto, colector, verificador, api, BASE } from "./_lib.mjs";

export const nombre = "11 Memoria de actividad (período · PDF · rangos inválidos · sin sesión)";

export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  try {
    const { madrid, cookie } = await contexto();
    const hoy = new Date().toISOString().slice(0, 10);

    const memoria = async (qs) => {
      const r = await fetch(`${BASE}/api/memoria?${qs}`, { headers: { cookie } });
      const ct = r.headers.get("content-type") ?? "";
      return { status: r.status, ct, d: ct.includes("json") ? await r.json().catch(() => null) : null, r };
    };

    // 1) Línea base ANTES de crear nada: la memoria debe moverse en +1, no valer «>0»
    //    (el workspace de pruebas ya tiene historial).
    const antes = await memoria(`desde=${hoy}&hasta=${hoy}&formato=json`);
    v.ok(antes.status === 200 && typeof antes.d?.expedientesTramitados === "number",
      `memoria del día en JSON (${antes.status}, tramitados ${antes.d?.expedientesTramitados})`);

    // 2) Un expediente nuevo suma exactamente uno, y cuenta como iniciado.
    const cli = await fx.cliente();
    const rx = await api("/api/expedientes", { body: { clienteId: cli, oficinaId: madrid.id } });
    const expId = rx.d?.expedienteId ?? rx.d?.id;
    fx.expediente(expId);
    const despues = await memoria(`desde=${hoy}&hasta=${hoy}&formato=json`);
    v.ok(despues.d?.expedientesTramitados === antes.d?.expedientesTramitados + 1,
      `el expediente nuevo suma 1 (${antes.d?.expedientesTramitados} → ${despues.d?.expedientesTramitados})`);
    v.ok(despues.d?.expedientesIniciados === antes.d?.expedientesIniciados + 1,
      `y cuenta como iniciado en el período (${despues.d?.expedientesIniciados})`);
    v.ok((despues.d?.procedimientos ?? []).length >= 1 && (despues.d?.procedimientos ?? []).every((p) => p.label && p.n > 0),
      `los procedimientos salen etiquetados (${(despues.d?.procedimientos ?? []).map((p) => `${p.label}:${p.n}`).slice(0, 3).join(", ") || "—"})`);

    // 3) Período anterior a la existencia del despacho → cero, sin reventar.
    const viejo = await memoria("desde=2015-01-01&hasta=2015-12-31&formato=json");
    v.ok(viejo.status === 200 && viejo.d?.expedientesTramitados === 0 && viejo.d?.procedimientos?.length === 0,
      `período sin actividad → 0 y sin procedimientos (${viejo.d?.expedientesTramitados})`);

    // 4) La memoria NO lleva datos personales: ninguna clave del JSON es un listado.
    const claves = Object.keys(despues.d ?? {});
    const sospechosas = claves.filter((k) => /cliente|nombre|nie|dni|email|referencia/i.test(k));
    v.ok(sospechosas.length === 0, `sin campos personales en la salida (${sospechosas.join(",") || "ninguno"})`);

    // 5) El PDF es un PDF de verdad (cabecera %PDF), no un JSON de error disfrazado.
    const pdf = await memoria(`desde=${hoy}&hasta=${hoy}`);
    const cabecera = pdf.status === 200 ? new Uint8Array(await pdf.r.arrayBuffer()).slice(0, 4) : new Uint8Array();
    v.ok(pdf.status === 200 && pdf.ct.includes("pdf") && String.fromCharCode(...cabecera) === "%PDF",
      `PDF descargable (${pdf.status}, ${pdf.ct}, «${String.fromCharCode(...cabecera)}»)`);

    // 6) Rangos imposibles: cortados con 400, sin consultar.
    const alReves = await memoria(`desde=${hoy}&hasta=2015-01-01&formato=json`);
    v.ok(alReves.status === 400, `fecha inicial posterior a la final → 400 (${alReves.status})`);
    const basura = await memoria("desde=ayer&hasta=hoy&formato=json");
    v.ok(basura.status === 400, `fechas con formato inválido → 400 (${basura.status})`);

    // 7) Sin sesión → 401 (la memoria es un documento institucional del despacho).
    const anon = await fetch(`${BASE}/api/memoria?desde=${hoy}&hasta=${hoy}&formato=json`);
    v.ok(anon.status === 401, `sin sesión → 401 (${anon.status})`);
  } catch (e) {
    v.ok(false, `excepción: ${e instanceof Error ? e.message : e}`);
  } finally {
    await fx.limpiar();
  }
  return v.resumen();
}
