// Seed des données de démo dans Supabase (service_role → bypass RLS).
// Lancer : node scripts/seed.mjs   (lit web/.env.local)
// Idempotent : supprime la gestoría de démo avant de réinsérer (cascade FKs).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const id = (p) => p + Math.random().toString(36).slice(2, 12);
const now = () => new Date().toISOString();
const dia = (d, h = 10, m = 0) => new Date(2026, 5, d, h, m).toISOString(); // juin 2026
const DEMO_EMAIL = "demo@aproba-software.com";
const DEMO_PASSWORD = "AprobaDemo2026!";

// Toute erreur Supabase fait échouer le seed (pas d'échec silencieux).
async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function ensureDemoUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { nombre: "Marta Ribas" },
  });
  if (data?.user) return data.user.id;
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
  const { data: list, error: e2 } = await admin.auth.admin.listUsers();
  if (e2) throw e2;
  const u = list.users.find((x) => x.email === DEMO_EMAIL);
  if (!u) throw new Error("usuario demo no encontrado");
  return u.id;
}

// Documents requis par type de trámite (miroir de la config Ajustes).
const DOCS_POR_TIPO = {
  ARRAIGO_SOCIAL: ["PASAPORTE", "EMPADRONAMIENTO", "CONTRATO_TRABAJO", "ANTECEDENTES_PENALES"],
  ARRAIGO_LABORAL: ["PASAPORTE", "EMPADRONAMIENTO", "ANTECEDENTES_PENALES"],
  RENOVACION: ["TARJETA_RESIDENCIA_TIE", "EMPADRONAMIENTO", "NOMINA"],
  REAGRUPACION: ["PASAPORTE", "LIBRO_FAMILIA", "CERTIFICADO_BANCARIO", "EMPADRONAMIENTO"],
  NACIONALIDAD: ["PASAPORTE", "EMPADRONAMIENTO", "ANTECEDENTES_PENALES"],
  NIE: ["PASAPORTE"],
  RESIDENCIA_LARGA: ["TARJETA_RESIDENCIA_TIE", "EMPADRONAMIENTO"],
  OTRO: ["PASAPORTE", "EMPADRONAMIENTO"],
};

// Combien de docs sont déjà validés selon l'état de l'expediente.
function estadosDocs(estadoExp, nbDocs) {
  if (estadoExp === "BORRADOR") return Array(nbDocs).fill("PENDIENTE");
  if (estadoExp === "DOCS_PENDIENTES") {
    return Array.from({ length: nbDocs }, (_, i) => (i < Math.ceil(nbDocs / 2) - 1 ? "VALIDADO" : i === Math.ceil(nbDocs / 2) - 1 ? "PROCESANDO" : "PENDIENTE"));
  }
  return Array(nbDocs).fill("VALIDADO"); // DOCS_VALIDADOS, FORM_GENERADO, PRESENTADO, RESUELTO
}

// Formulario EX (placeholder) par trámite + tasa.
const EX_POR_TIPO = { ARRAIGO_SOCIAL: "EX15", ARRAIGO_LABORAL: "EX15", RENOVACION: "EX17", REAGRUPACION: "EX19", NACIONALIDAD: "EX15", RESIDENCIA_LARGA: "EX17", NIE: "EX15", OTRO: "EX15" };

async function main() {
  const userId = await ensureDemoUser();
  await must("User(demo)", admin.from("User").upsert({ id: userId, email: DEMO_EMAIL, nombre: "Marta Ribas" }));

  // Nettoyage d'une démo précédente (cascade via FKs).
  await must("clean Workspace", admin.from("Workspace").delete().eq("nombre", "Gestoría Vallès"));

  await must("User(equipo)", admin.from("User").upsert([
    { id: id("u_"), email: "diego@gestoriavalles.es", nombre: "Diego Fuentes" },
    { id: id("u_"), email: "nuria@gestoriavalles.es", nombre: "Nuria Camps" },
  ], { onConflict: "email" }));
  const equipo = await must("User(equipo:read)", admin.from("User").select("id,email").in("email", ["diego@gestoriavalles.es", "nuria@gestoriavalles.es"]));
  const diego = equipo.find((u) => u.email.startsWith("diego")).id;
  const nuria = equipo.find((u) => u.email.startsWith("nuria")).id;

  const ws = id("ws_");
  await must("Workspace", admin.from("Workspace").insert({ id: ws, nombre: "Gestoría Vallès", tipo: "GESTORIA", updatedAt: now() }));
  await must("Membership", admin.from("Membership").insert([
    { id: id("m_"), userId, workspaceId: ws, role: "OWNER" },
    { id: id("m_"), userId: diego, workspaceId: ws, role: "GESTOR" },
    { id: id("m_"), userId: nuria, workspaceId: ws, role: "GESTOR" },
  ]));
  await must("Subscription", admin.from("Subscription").insert({ id: id("sub_"), workspaceId: ws, plan: "PRO", estado: "ACTIVA" }));

  // ── Config : servicios (tarifas + docs) et avisos ─────────────────────────
  const SERVICIOS = [
    ["arraigo_social", "Arraigo social", "Residencia por arraigo", true, 150, 200, ["Pasaporte", "Certificado de empadronamiento", "Contrato de trabajo", "Antecedentes penales"]],
    ["renovacion_tie", "Renovación de TIE", "Renovar tu tarjeta de residencia", true, 80, 100, ["TIE actual", "Certificado de empadronamiento", "Justificante de medios económicos"]],
    ["reagrupacion", "Reagrupación familiar", "Traer a tu familia", true, 200, 220, ["Pasaporte", "Libro de familia", "Justificante de vivienda", "Justificante de medios económicos"]],
    ["nacionalidad", "Nacionalidad española", "Solicitar la nacionalidad", true, 300, 300, ["Pasaporte", "Certificado de nacimiento", "Certificado de empadronamiento", "Antecedentes penales"]],
    ["arraigo_laboral", "Arraigo laboral", "Residencia por arraigo laboral", false, 150, 200, ["Pasaporte", "Informe de vida laboral", "Certificado de empadronamiento", "Antecedentes penales"]],
    ["larga_duracion", "Residencia de larga duración", "Residencia permanente", false, 150, 150, ["TIE actual", "Certificado de empadronamiento", "Justificante de medios económicos"]],
    ["nie", "Asignación de NIE", "Obtener tu número de identidad", false, 90, 0, ["Pasaporte"]],
  ];
  await must("ServicioConfig", admin.from("ServicioConfig").insert(
    SERVICIOS.map(([clave, label, descripcion, active, anticipo, resto, docs], i) => ({
      id: `svc_${ws}_${clave}`, workspaceId: ws, clave, label, descripcion, active, anticipo, resto, docs, orden: i,
    })),
  ));

  // Compte bancaire du despacho (réception des paiements) — ignoré si table absente.
  {
    const { error } = await admin.from("CuentaBancaria").insert({
      id: `cta_${ws}_principal`, workspaceId: ws,
      titular: "Gestoría Vallès SL", iban: "ES7621000418450200051332", banco: "CaixaBank", activa: true,
    });
    if (error && !/does not exist|relation/i.test(error.message)) throw new Error(`CuentaBancaria: ${error.message}`);
  }

  const AVISOS = [
    ["doc_recibido", "Documento recibido", "Hola {nombre}, hemos recibido tu {documento}. Lo revisamos enseguida.", "whatsapp", true],
    ["doc_validado", "Documento validado", "Tu {documento} es correcto y ha quedado validado. ✓", "whatsapp", true],
    ["doc_rechazado", "Documento rechazado", "Tu {documento} no se lee bien. Por favor, vuelve a subirlo desde tu enlace.", "whatsapp", true],
    ["cita_asignada", "Cita asignada", "Tienes cita el {fecha} para la toma de huellas. No olvides tu pasaporte.", "whatsapp", true],
    ["presentado", "Expediente presentado", "Tu expediente ya está presentado en la Administración. Te avisaremos de la resolución.", "whatsapp", true],
    ["resolucion", "Resolución favorable", "¡Buenas noticias, {nombre}! Tu trámite ha sido resuelto favorablemente.", "email", false],
  ];
  await must("AvisoConfig", admin.from("AvisoConfig").insert(
    AVISOS.map(([clave, evento, template, canal, activo], i) => ({
      id: `avi_${ws}_${clave}`, workspaceId: ws, clave, evento, template, canal, activo, orden: i,
    })),
  ));

  // ── Clientes + expedientes ────────────────────────────────────────────────
  // [nombre, apellidos, nacionalidad, [[ref, tipo, estado, asignado, fechaLimite?, creadoDia]]]
  const SPEC = [
    ["Julia", "Mendoza", "Colombia", [["EXP-2026-0042", "ARRAIGO_SOCIAL", "DOCS_PENDIENTES", userId, "2026-06-28", 8]]],
    ["Karim", "Benali", "Marruecos", [["EXP-2026-0041", "RENOVACION", "DOCS_VALIDADOS", diego, "2026-06-20", 6]]],
    ["Liu", "Wei", "China", [["EXP-2026-0044", "REAGRUPACION", "DOCS_PENDIENTES", nuria, "2026-06-13", 9]]],
    ["Aïcha", "Diallo", "Senegal", [["EXP-2026-0036", "ARRAIGO_LABORAL", "PRESENTADO", diego, null, 2]]],
    ["Oksana", "Koval", "Ucrania", [["EXP-2026-0031", "NACIONALIDAD", "PRESENTADO", userId, null, 1]]],
    ["Samuel", "Okafor", "Nigeria", [["EXP-2026-0045", "NIE", "BORRADOR", nuria, null, 10]]],
    ["Fatima", "El Amrani", "Marruecos", [["EXP-2026-0029", "RENOVACION", "RESUELTO", diego, null, 1]]],
    ["Andrés", "Patiño", "Colombia", [["EXP-2026-0027", "ARRAIGO_SOCIAL", "RESUELTO", userId, null, 1]]],
    ["Ioana", "Popescu", "Rumanía", [["EXP-2026-0040", "OTRO", "DOCS_VALIDADOS", nuria, null, 5]]],
    ["Mohammed", "Khan", "Pakistán", [
      ["EXP-2026-0038", "REAGRUPACION", "DOCS_PENDIENTES", userId, "2026-06-16", 4],
      ["EXP-2026-0022", "NIE", "RESUELTO", diego, null, 1],
    ]],
    ["Rosa", "Chávez", "Perú", [["EXP-2026-0035", "RENOVACION", "FORM_GENERADO", userId, "2026-06-09", 3]]],
    ["María", "Fernández", "Argentina", [["EXP-2026-0030", "NACIONALIDAD", "DOCS_VALIDADOS", diego, null, 2]]],
  ];

  const NOMBRE_POR_USER = { [userId]: "Marta R.", [diego]: "Diego F.", [nuria]: "Nuria C." };
  let totalDocs = 0, totalEventos = 0, totalForms = 0;
  let juliaEid = null;

  // Ficha complète de Julia (capturée dans le portail) → formulaires EX/790 pleins en démo.
  const FICHA_JULIA = {
    apellidos: "Mendoza Restrepo", email: "julia.mendoza@email.com", telefono: "600112233",
    numeroDocumento: "Y0429317K", pasaporte: "AY0429317", sexo: "M", fechaNacimiento: "1992-03-14",
    lugarNacimiento: "Bogotá", paisNacimiento: "Colombia", estadoCivil: "S",
    via: "Calle Mallorca", numeroVia: "245", piso: "3º 2ª", codigoPostal: "08036",
    municipio: "Barcelona", provincia: "Barcelona", nombrePadre: "Carlos Mendoza", nombreMadre: "Ana Restrepo",
  };

  for (const [nombre, apellidos, nac, exps] of SPEC) {
    const cid = id("c_");
    const extra = nombre === "Julia" ? FICHA_JULIA : {};
    await must(`Cliente(${nombre})`, admin.from("Cliente").insert({ id: cid, workspaceId: ws, nombre, apellidos, nacionalidad: nac, ...extra, updatedAt: now() }));

    for (const [ref, tipo, estado, asignado, limite, creadoDia] of exps) {
      const eid = id("e_");
      await must(`Exp(${ref})`, admin.from("Expediente").insert({
        id: eid, workspaceId: ws, clienteId: cid, referencia: ref, tipo, estado,
        asignadoAId: asignado, fechaLimite: limite, createdAt: dia(creadoDia, 9), updatedAt: now(),
        // lien portail canonique de la démo (animations landing) → expediente de Julia
        portalToken: ref === "EXP-2026-0042" ? "x7k2" : null,
      }));

      // Documentos selon le type + l'état.
      const tipos = DOCS_POR_TIPO[tipo];
      const estados = estadosDocs(estado, tipos.length);
      const docIds = [];
      for (let i = 0; i < tipos.length; i++) {
        const did = id("d_");
        docIds.push(did);
        await must(`Doc(${ref}/${tipos[i]})`, admin.from("Documento").insert({
          id: did, expedienteId: eid, tipo: tipos[i], estado: estados[i],
          nombreArchivo: estados[i] === "PENDIENTE" ? null : `${tipos[i].toLowerCase()}.jpg`,
          uploadedAt: estados[i] === "PENDIENTE" ? null : dia(creadoDia, 11 + i),
        }));
        totalDocs++;
      }

      // Extraction IA détaillée pour l'expediente vitrine (Julia).
      if (ref === "EXP-2026-0042") {
        await must("Extraction(pasaporte)", admin.from("Extraction").insert({
          id: id("x_"), documentoId: docIds[0], tipoDetectado: "pasaporte", confianzaGlobal: 0.97, legibilidad: "legible",
          datos: [
            { label: "Nombre completo", value: "JULIA MENDOZA TORRES" },
            { label: "Nº pasaporte", value: "AY0429317" },
            { label: "Nacionalidad", value: "COLOMBIA" },
            { label: "Fecha de nacimiento", value: "14/03/1992" },
            { label: "Caducidad", value: "02/11/2031" },
          ],
          alertas: [], modelo: "claude-opus-4-8",
        }));
        await must("Extraction(empadronamiento)", admin.from("Extraction").insert({
          id: id("x_"), documentoId: docIds[1], tipoDetectado: "empadronamiento", confianzaGlobal: 0.91, legibilidad: "legible",
          datos: [
            { label: "Dirección", value: "C/ Mallorca 245, 3º 2ª" },
            { label: "Municipio", value: "Barcelona" },
            { label: "Fecha de alta", value: "12/01/2023" },
          ],
          alertas: ["El contrato de trabajo sigue pendiente de subida"], modelo: "claude-opus-4-8",
        }));
      }

      // Historial (eventos).
      const eventos = [
        { tipo: "CREADO", descripcion: "Expediente creado", userId: asignado, createdAt: dia(creadoDia, 9, 5) },
      ];
      if (estado !== "BORRADOR") eventos.push({ tipo: "NOTIFICACION_ENVIADA", descripcion: "Enlace enviado al cliente por WhatsApp", userId: asignado, createdAt: dia(creadoDia, 9, 30) });
      const validados = estados.filter((s) => s === "VALIDADO").length;
      if (validados > 0) eventos.push({ tipo: "DOC_VALIDADO", descripcion: `IA validó ${validados}/${tipos.length} documentos`, userId: null, createdAt: dia(creadoDia, 14) });
      if (estado === "FORM_GENERADO" || estado === "PRESENTADO" || estado === "RESUELTO") eventos.push({ tipo: "FORM_GENERADO", descripcion: "Formularios generados automáticamente", userId: null, createdAt: dia(creadoDia + 1, 9) });
      if (estado === "PRESENTADO" || estado === "RESUELTO") eventos.push({ tipo: "PRESENTADO", descripcion: "Presentado en sede electrónica", userId: asignado, createdAt: dia(creadoDia + 1, 12) });
      if (estado === "RESUELTO") eventos.push({ tipo: "ESTADO_CAMBIADO", descripcion: "Resolución favorable 🎉", userId: asignado, createdAt: dia(creadoDia + 3, 10) });
      for (const ev of eventos) {
        await must(`Evento(${ref})`, admin.from("ExpedienteEvento").insert({ id: id("ev_"), expedienteId: eid, ...ev }));
        totalEventos++;
      }

      // Formularios générés.
      if (estado === "FORM_GENERADO" || estado === "PRESENTADO" || estado === "RESUELTO") {
        for (const ftipo of [EX_POR_TIPO[tipo], "TASA_790_012"]) {
          await must(`Form(${ref}/${ftipo})`, admin.from("Formulario").insert({ id: id("f_"), expedienteId: eid, tipo: ftipo, datos: {}, generadoAt: dia(creadoDia + 1, 9) }));
          totalForms++;
        }
      }

      if (ref === "EXP-2026-0042") juliaEid = eid;
    }
  }

  // ── Facturas (mai-juin 2026, montants alignés sur les tarifas de los servicios) ──
  // [numero, cliente, concepto, base, estado, fechaEmision, fechaVencimiento?]
  const FACTURAS = [
    ["2026-0048", "Julia Mendoza", "Tramitación arraigo social", 350, "EMITIDA", "2026-06-09", "2026-07-09"],
    ["2026-0047", "Liu Wei", "Reagrupación familiar", 420, "EMITIDA", "2026-06-06", "2026-07-06"],
    ["2026-0046", "Aïcha Diallo", "Tramitación arraigo laboral", 350, "PAGADA", "2026-06-03", null],
    ["2026-0045", "Karim Benali", "Renovación TIE", 180, "EMITIDA", "2026-06-01", "2026-07-01"],
    ["2026-0044", "Oksana Koval", "Solicitud de nacionalidad", 600, "PAGADA", "2026-05-28", null],
    ["2026-0043", "Fatima El Amrani", "Renovación TIE", 180, "VENCIDA", "2026-05-02", "2026-06-01"],
    ["2026-0042", "Andrés Patiño", "Tramitación arraigo social", 350, "PAGADA", "2026-05-27", null],
    ["2026-0041", "Mohammed Khan", "Reagrupación familiar", 420, "EMITIDA", "2026-05-26", "2026-06-25"],
    ["2026-0040", "Ioana Popescu", "Asesoramiento extranjería", 90, "PAGADA", "2026-05-24", null],
    ["2026-0039", "Carlos Mendoza", "Tramitación arraigo social", 350, "PAGADA", "2026-05-22", null],
    ["2026-0038", "Rosa Chávez", "Renovación TIE", 180, "VENCIDA", "2026-04-28", "2026-05-28"],
    ["2026-0037", "María Fernández", "Solicitud de nacionalidad", 600, "PAGADA", "2026-05-20", null],
    ["2026-0036", "Pedro Sousa", "Asesoramiento extranjería", 120, "BORRADOR", "2026-05-18", null],
    ["2026-0035", "Camila Restrepo", "Tramitación arraigo social", 350, "PAGADA", "2026-05-15", null],
  ];
  for (const [numero, cliente, concepto, base, estado, fecha, vence] of FACTURAS) {
    const iva = Math.round(base * 0.21 * 100) / 100;
    await must(`Factura(${numero})`, admin.from("Factura").insert({
      id: id("fa_"), workspaceId: ws,
      expedienteId: numero === "2026-0048" ? juliaEid : null,
      numero, clienteNombre: cliente, concepto,
      baseImponible: base, iva, total: Math.round(base * 1.21 * 100) / 100,
      estado, fechaEmision: `${fecha}T10:00:00+02:00`,
      fechaVencimiento: vence ? `${vence}T10:00:00+02:00` : null,
    }));
  }

  // Relecture de contrôle.
  const exps = await must("verify", admin.from("Expediente").select("referencia").eq("workspaceId", ws));
  const facs = await must("verify facturas", admin.from("Factura").select("numero").eq("workspaceId", ws));
  console.log(`✅ Seed OK — ${exps.length} expedientes · ${totalDocs} documentos · ${totalEventos} eventos · ${totalForms} formularios · ${facs.length} facturas`);
  console.log(`   workspace: ${ws}`);
  console.log(`   equipo: ${Object.values(NOMBRE_POR_USER).join(", ")}`);
  console.log(`   login démo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error("❌ Seed échoué:", e?.message || e);
  process.exit(1);
});
