// PRUEBA DE PUNTA A PUNTA del motor de migración: la ruta REAL /api/importar/ejecutar, SOLO en
// el despacho de pruebas «Gestoría de Carmen». Un archivo fabricado con las trampas que sacó a
// la luz la migración de Luis (Asenjo, 24-25/09/2026):
//   · listado de FACTURAS: la misma persona en varias filas (antes, la 2ª se perdía entera);
//   · dos servicios del mismo cliente el mismo día, con dos números de factura (Yousupha);
//   · un servicio cobrado en dos facturas, «Primer pago (1-2)» + «Segundo pago (2-2)» (Cindy);
//   · una familia que comparte el email del titular (no son una sola persona);
//   · dos homónimos con NIE distinto (dos personas, con aviso);
//   · un trabajador cuya factura pagó su empresa, y una empresa sin persona (consulta);
//   · un cliente que YA existe: se completa, nunca se pisa (su CP, su teléfono, su caducidad).
// Dos pasadas: la 2ª no debe crear nada. Todo lo creado lleva «ZZPRUEBA» y se borra al
// terminar (KEEP=1 lo deja para mirarlo en la app).
//
//   MIGRA_WS=db135ffb-e0b8-442c-b654-795ede089185 MIGRA_USER=35cb55c3-14f2-45d7-95fc-4206161f5d5d \
//     scripts/migracion/correr.sh scripts/migracion/e2e-motor.ts

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import * as servidor from "@/lib/supabase/server";
import { aplicarMapeo, type Mapeo } from "@/lib/importar";

const CARMEN = "db135ffb-e0b8-442c-b654-795ede089185";
const MARCA = "ZZPRUEBA";

const cabecera = ["Nombre completo", "Documento", "Email", "Empresa", "Trámite", "Fecha", "Referencia", "Importe", "Estado del cobro", "CP"];
const filas: string[][] = [
  [`${MARCA} Cindy Vargas`, "Z9990001L", "", "", "ARRAIGO SOCIAL – Primer pago (1-2)", "2026-09-10", "ZZT-0262", "302,50", "Cobrada", ""],
  [`${MARCA} Cindy Vargas`, "Z9990001L", "", "", "ARRAIGO SOCIAL – Segundo pago (2-2)", "2026-09-25", "ZZT-0271", "242", "Pendiente", ""],
  [`${MARCA} Yousupha Manneh`, "PZZ12345", "", "", "CUENTA AJENA – BAKARY MANNEH", "2026-05-26", "ZZT-0171", "181,50", "Cobrada", ""],
  [`${MARCA} Yousupha Manneh`, "PZZ12345", "", "", "CUENTA AJENA – LAMINE MANNEH", "2026-05-26", "ZZT-0172", "181,50", "Cobrada", ""],
  [`${MARCA} Amadou Diallo`, "", "zzfamilia@example.com", "", "RENOVACION TIE", "2024-01-10", "ZZT-0010", "150", "Cobrada", ""],
  [`${MARCA} Awa Diallo`, "", "zzfamilia@example.com", "", "REAGRUPACION", "2025-03-01", "ZZT-0011", "400", "Cobrada", ""],
  [`${MARCA} Amadou Diallo`, "", "zzfamilia@example.com", "", "RENOVACION TIE", "2025-06-01", "ZZT-0012", "150", "Cobrada", ""],
  [`${MARCA} Maria Garcia`, "Y9990001Z", "", "", "RENOVACION TIE", "2025-01-01", "ZZT-0020", "150", "Cobrada", ""],
  [`${MARCA} Maria Garcia`, "Y9990002Z", "", "", "RENOVACION TIE", "2025-02-01", "ZZT-0021", "150", "Cobrada", ""],
  [`${MARCA} Javier Lozano`, "Z9990003L", "", `${MARCA} EMPRESA SL`, "RENOVACION TIE", "2026-09-10", "ZZT-0261", "574,75", "Pendiente", ""],
  ["", "", "", `${MARCA} CONSULTORA SL`, "CONSULTA EMPRESA", "2026-02-01", "ZZT-0050", "363", "Pendiente", ""],
  [`${MARCA} Existente Uno`, "Z9990009L", "zzexist@example.com", "", "RENOVACION TIE", "2025-05-05", "ZZT-0090", "150", "Cobrada", "28001"],
];
const mapeo: Mapeo = {
  columnas: ["nombreCompleto", "documento", "email", "empresa", "tramite", "fechaResolucion", "referencia", "importe", "estadoCobro", "codigoPostal"]
    .map((campo, indice) => ({ indice, campo: campo as Mapeo["columnas"][number]["campo"] })),
  tramites: {
    "ARRAIGO SOCIAL – Primer pago (1-2)": "arraigo_social", "ARRAIGO SOCIAL – Segundo pago (2-2)": "arraigo_social",
    "CUENTA AJENA – BAKARY MANNEH": "srv_z6dtni8", "CUENTA AJENA – LAMINE MANNEH": "srv_z6dtni8",
    "RENOVACION TIE": "renovacion_tie", "REAGRUPACION": "reagrupacion", "CONSULTA EMPRESA": "srv_hlcey72",
  },
  validezMeses: {}, estados: {}, crearHistorial: true, crearFamilias: false,
};

let fallos = 0;
const check = (ok: boolean, msg: string) => { console.log(`  ${ok ? "✓" : "✗"} ${msg}`); if (!ok) fallos++; };

(async () => {
  if (process.env.MIGRA_WS !== CARMEN) throw new Error("MIGRA_WS no es «Gestoría de Carmen»: esta prueba solo corre allí");
  if (!(servidor as Record<string, unknown>).__STUB_MIGRACION__) throw new Error("sin sesion-stub: usa scripts/migracion/correr.sh");
  const a = createSupabaseAdmin();

  const limpiar = async () => {
    const { data: cs } = await a.from("Cliente").select("id").eq("workspaceId", CARMEN).eq("nombre", MARCA);
    const { data: es } = await a.from("Empresa").select("id").eq("workspaceId", CARMEN).ilike("razonSocial", `${MARCA}%`);
    const cli = ((cs ?? []) as { id: string }[]).map((c) => c.id);
    const emp = ((es ?? []) as { id: string }[]).map((e) => e.id);
    if (cli.length) {
      await a.from("ServicioHistorico").delete().eq("workspaceId", CARMEN).in("clienteId", cli);
      await a.from("Vencimiento").delete().eq("workspaceId", CARMEN).in("clienteId", cli);
      await a.from("Cliente").delete().eq("workspaceId", CARMEN).in("id", cli);
    }
    if (emp.length) {
      await a.from("ServicioHistorico").delete().eq("workspaceId", CARMEN).in("empresaId", emp);
      await a.from("Empresa").delete().eq("workspaceId", CARMEN).in("id", emp);
    }
    return cli.length + emp.length;
  };
  const cuenta = async (tabla: string) => (await a.from(tabla).select("id", { count: "exact", head: true }).eq("workspaceId", CARMEN)).count ?? -1;

  const restos = await limpiar();
  if (restos) console.log(`(restos de una prueba anterior borrados: ${restos})`);
  const base = { clientes: await cuenta("Cliente"), historial: await cuenta("ServicioHistorico"), empresas: await cuenta("Empresa"), vencimientos: await cuenta("Vencimiento") };

  // Un cliente que YA existe: la migración solo puede rellenar sus huecos (aquí, el email).
  const existenteId = crypto.randomUUID();
  const { error: eEx } = await a.from("Cliente").insert({
    id: existenteId, workspaceId: CARMEN, nombre: MARCA, apellidos: "Existente Uno", numeroDocumento: "Z9990009L",
    codigoPostal: "08001", telefono: "+34600000000", fechaCaducidad: "2030-01-01", esSolicitante: false, updatedAt: new Date().toISOString(),
  });
  if (eEx) throw eEx;

  const { POST } = await import("@/app/api/importar/ejecutar/route");
  const importar = async () => {
    const res = await POST(new Request("http://migracion.local/api/importar/ejecutar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filas: [cabecera, ...filas], mapeo: JSON.parse(JSON.stringify(mapeo)), primeraFilaEsCabecera: true }),
    }));
    const r = await res.json();
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(r)}`);
    return r;
  };

  try {
    console.log("\n1ª pasada");
    const r1 = await importar();
    console.log("  →", JSON.stringify({ ...r1, avisos: undefined }));
    for (const x of r1.avisos) console.log("    aviso:", x);
    check(r1.clientesCreados === 7, `7 clientes nuevos (Cindy, Yousupha, Amadou, Awa, 2 Maria Garcia, Javier): ${r1.clientesCreados}`);
    check(r1.clientesActualizados === 1, `el existente se completa: ${r1.clientesActualizados}`);
    check(r1.filasMismaPersona === 3, `3 filas de una persona ya vista (Cindy, Yousupha, Amadou): ${r1.filasMismaPersona}`);
    check(r1.serviciosCreados === 12, `12 servicios, uno por fila (antes se perdían los de la 2ª fila y el 2º del mismo día): ${r1.serviciosCreados}`);
    check(r1.serviciosEnlazados === 1, `1 factura enlazada como 2º pago: ${r1.serviciosEnlazados}`);
    check(r1.empresas === 2, `2 empresas nuevas: ${r1.empresas}`);
    check(r1.avisos.some((x: string) => x.includes("Mismo nombre")), "aviso de homónimos con otro NIE");

    const { data: cs } = await a.from("Cliente").select("id, apellidos, numeroDocumento, pasaporte, email, codigoPostal, telefono, fechaCaducidad").eq("workspaceId", CARMEN).eq("nombre", MARCA);
    const cli = (cs ?? []) as { id: string; apellidos: string; numeroDocumento: string | null; pasaporte: string | null; email: string | null; codigoPostal: string | null; telefono: string | null; fechaCaducidad: string | null }[];
    check(cli.length === 8, `8 fichas ZZPRUEBA en total: ${cli.length}`);
    const ex = cli.find((c) => c.id === existenteId);
    check(ex?.codigoPostal === "08001" && ex?.telefono === "+34600000000" && String(ex?.fechaCaducidad).startsWith("2030-01-01"), `el existente conserva CP, teléfono y caducidad: ${ex?.codigoPostal} · ${ex?.telefono} · ${ex?.fechaCaducidad}`);
    check(ex?.email === "zzexist@example.com", `y recibe el email que le faltaba: ${ex?.email}`);
    check(cli.filter((c) => c.apellidos.endsWith("Diallo")).length === 2, "la familia que comparte email son 2 personas");
    check(cli.filter((c) => c.apellidos === "Maria Garcia").length === 2, "los 2 homónimos con NIE distinto son 2 personas");

    const idDe = (ap: string) => cli.find((c) => c.apellidos === ap)?.id;
    const { data: es } = await a.from("Empresa").select("id, razonSocial").eq("workspaceId", CARMEN).ilike("razonSocial", `${MARCA}%`);
    const empDe = (n: string) => ((es ?? []) as { id: string; razonSocial: string }[]).find((e) => e.razonSocial === n)?.id;
    const { data: hs } = await a.from("ServicioHistorico").select("id, clienteId, empresaId, referencia, notas, pagoDeId, cobro")
      .eq("workspaceId", CARMEN).or(`clienteId.in.(${cli.map((c) => c.id).join(",")}),empresaId.in.(${[empDe(`${MARCA} EMPRESA SL`), empDe(`${MARCA} CONSULTORA SL`)].join(",")})`);
    const h = (hs ?? []) as { id: string; clienteId: string | null; empresaId: string | null; referencia: string; notas: string | null; pagoDeId: string | null; cobro: string | null }[];
    const ref = (r: string) => h.find((x) => x.referencia === r);
    check(h.length === 12, `12 servicios en el historial: ${h.length}`);
    check(ref("ZZT-0271")?.pagoDeId === ref("ZZT-0262")?.id && !ref("ZZT-0262")?.pagoDeId, "el 2º pago de Cindy apunta al 1º");
    check(ref("ZZT-0262")?.clienteId === ref("ZZT-0271")?.clienteId && ref("ZZT-0262")?.clienteId === idDe("Cindy Vargas"), "las 2 facturas de Cindy, en su única ficha");
    check(Boolean(ref("ZZT-0171") && ref("ZZT-0172")) && ref("ZZT-0171")?.clienteId === ref("ZZT-0172")?.clienteId, "Yousupha: los 2 servicios del mismo día, en una ficha");
    check((ref("ZZT-0171")?.notas ?? "").startsWith("CUENTA AJENA – BAKARY") && (ref("ZZT-0172")?.notas ?? "").startsWith("CUENTA AJENA – LAMINE"), "cada uno con su concepto original");
    check(!(ref("ZZT-0010")?.notas ?? "").includes("RENOVACION"), `un concepto que repite el servicio no se guarda: «${ref("ZZT-0010")?.notas ?? ""}»`);
    check(ref("ZZT-0261")?.clienteId === idDe("Javier Lozano") && ref("ZZT-0261")?.empresaId === empDe(`${MARCA} EMPRESA SL`), "la factura del trabajador: titular él, pagada por su empresa");
    check(!ref("ZZT-0050")?.clienteId && ref("ZZT-0050")?.empresaId === empDe(`${MARCA} CONSULTORA SL`) && ref("ZZT-0050")?.cobro === "PENDIENTE", "la consulta de la empresa sin persona, en la empresa y pendiente");

    // Renovación de Amadou: UNA, con la caducidad más reciente de sus 2 filas.
    const esperada = aplicarMapeo([filas[4], filas[6]], mapeo).map((f) => f.caducidadDerivada).sort().pop();
    const { data: vs } = await a.from("Vencimiento").select("fecha").eq("clienteId", idDe("Amadou Diallo") ?? "");
    const fechas = ((vs ?? []) as { fecha: string }[]).map((v) => String(v.fecha).slice(0, 10));
    check(fechas.length === 1 && fechas[0] === esperada, `Amadou: 1 renovación, la más reciente (${esperada}): ${fechas.join(", ")}`);

    console.log("\n2ª pasada (el mismo archivo)");
    const r2 = await importar();
    console.log("  →", JSON.stringify({ ...r2, avisos: undefined }));
    check(r2.clientesCreados === 0 && r2.serviciosCreados === 0 && r2.empresas === 0, `no crea nada: ${r2.clientesCreados} clientes, ${r2.serviciosCreados} servicios, ${r2.empresas} empresas`);
    check(r2.serviciosOmitidos === 12 && r2.serviciosEnlazados === 0, `reconoce los 12 servicios: ${r2.serviciosOmitidos} (enlaces nuevos: ${r2.serviciosEnlazados})`);
    check((await cuenta("Cliente")) === base.clientes + 8 && (await cuenta("ServicioHistorico")) === base.historial + 12, "ni una ficha ni un servicio de más");
  } finally {
    if (process.env.KEEP === "1") console.log("\nKEEP=1: los datos ZZPRUEBA se quedan en «Gestoría de Carmen».");
    else {
      await limpiar();
      const fin = { clientes: await cuenta("Cliente"), historial: await cuenta("ServicioHistorico"), empresas: await cuenta("Empresa"), vencimientos: await cuenta("Vencimiento") };
      check(JSON.stringify(fin) === JSON.stringify(base), `limpieza: el despacho vuelve a como estaba ${JSON.stringify(fin)}`);
    }
  }
  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallida(s)` : "\n✓ todo correcto");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); });
