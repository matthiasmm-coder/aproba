// Mandato OFICIAL del Consejo General de Gestores Administrativos (pedido por Juan, 26/09/2026):
// activado en el despacho, un trámite de extranjería sale en el impreso del Consejo (editable
// para el gestor, plano para el cliente), la nacionalidad en el suyo, un servicio marcado
// «General» en el general del Consejo y uno marcado «El de Aproba» sigue con el mandato de
// Aproba. Multi-servicio (27/09/2026): un mandato por modelo, en UN solo PDF. Interruptores
// separados hoja/mandato (si supabase/mandato-activo.sql está aplicada). La config de la demo
// se restaura en finally.
import { PDFDocument } from "pdf-lib";
import { contexto, api, colector, verificador, admin, BASE } from "./_lib.mjs";

async function textoPdf(buf) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) out += " " + (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ");
  return out.replace(/\s+/g, " ");
}
async function camposPdf(buf) {
  const pdf = await PDFDocument.load(buf);
  return Object.fromEntries(pdf.getForm().getFields().map((f) => [f.getName(), typeof f.getText === "function" ? (f.getText() ?? "") : ""]));
}

export const nombre = "14 Mandato oficial del Consejo";
export async function run() {
  const v = verificador(nombre);
  const fx = colector();
  const { ws, madrid, cookie } = await contexto();
  // mandatoActivo solo existe tras supabase/mandato-activo.sql: se lee aparte.
  const COLS = "hojaEncargoActiva, mandatarioColegiado, mandatarioColegio, mandatoConsejo";
  const { error: sinCol } = await admin.from("Workspace").select("mandatoActivo").eq("id", ws).maybeSingle();
  const conInterruptor = !sinCol;
  const cols = conInterruptor ? `${COLS}, mandatoActivo` : COLS;
  const { data: antes } = await admin.from("Workspace").select(cols).eq("id", ws).maybeSingle();
  try {
    const { error: eCfg } = await admin.from("Workspace").update({
      hojaEncargoActiva: true, mandatarioColegiado: "9999",
      mandatarioColegio: "Colegio Oficial de Gestores Administrativos de Barcelona",
      mandatoConsejo: { activo: true, porServicio: { nie: "siempre", arraigo_laboral: "general" } },
      ...(conInterruptor ? { mandatoActivo: true } : {}),
    }).eq("id", ws);
    v.ok(!eCfg, `config de prueba en la demo (${eCfg?.message ?? "ok"})`);

    const r1 = await api("/api/expedientes", { body: { nuevo: { nombre: "ZZE2E", apellidos: "Mandato" }, oficinaId: madrid.id } });
    const id = r1.d.expedienteId;
    fx.expediente(id);
    const { data: exp } = await admin.from("Expediente").select("clienteId, portalToken").eq("id", id).maybeSingle();
    if (exp?.clienteId) {
      fx.c.clientes.push(exp.clienteId);
      await admin.from("Cliente").update({ numeroDocumento: "Y0000000Z", via: "Calle ZZE2E", numeroVia: "7", piso: "2º", codigoPostal: "08001", municipio: "Barcelona", telefono: "600000000" }).eq("id", exp.clienteId);
    }
    const mandato = async (clave) => {
      await api(`/api/expedientes/${id}/servicio`, { body: { clave } });
      const r = await fetch(`${BASE}/api/expedientes/${id}/encargo?doc=mandato`, { headers: { cookie } });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    };

    // 1) Extranjería → impreso del Consejo, EDITABLE para el gestor, con cliente y gestor.
    const bEx = await mandato("renovacion_tie");
    const fEx = bEx ? await camposPdf(bEx) : {};
    const tEx = bEx ? await textoPdf(bEx) : "";
    v.ok(/SOLICITUD DE TRAMITES DE EXTRANJER/i.test(tEx), "extranjería → impreso oficial del Consejo");
    v.ok(fEx["Dña"] === "ZZE2E Mandato" && fEx["DNI"] === "Y0000000Z" && fEx["n0001"] === "7" && fEx["CP"] === "08001", `cliente en sus casillas (${fEx["Dña"]} · ${fEx["DNI"]} · nº ${fEx["n0001"]} · ${fEx["CP"]})`);
    v.ok(fEx["DDña 2"] === "9999" && fEx["perteneciente al Colegio Oficial de Gestores Administrativos de"] === "Barcelona" && fEx["Administrativos de"] === "Barcelona", "gestor: nº de colegiado y Colegio (solo el territorio, dos veces)");

    // 2) Al cliente (portal) sale PLANO: sin campos, con los datos impresos.
    if (exp?.portalToken) {
      const rp = await fetch(`${BASE}/api/portal/encargo?token=${exp.portalToken}&doc=mandato`);
      const bp = rp.ok ? Buffer.from(await rp.arrayBuffer()) : null;
      const nCampos = bp ? Object.keys(await camposPdf(bp)).length : -1;
      const tp = bp ? await textoPdf(bp) : "";
      v.ok(rp.ok && nCampos === 0 && tp.includes("ZZE2E Mandato") && /SOLICITUD DE TRAMITES DE EXTRANJER/i.test(tp), `portal del cliente: impreso del Consejo aplanado (${rp.status}, ${nCampos} campos)`);
    } else v.ok(false, "sin portalToken");

    // 3) Nacionalidad → su propio impreso.
    const bNac = await mandato("nacionalidad");
    const tNac = bNac ? await textoPdf(bNac) : "";
    const fNac = bNac ? await camposPdf(bNac) : {};
    v.ok(/NACIONALIDAD ESPA[NÑ]OLA POR RESIDENCIA/i.test(tNac) && fNac["conDNI"] === "Y0000000Z", "nacionalidad → impreso de nacionalidad del Consejo");

    // 4) Servicio marcado «General» → el general del Consejo, con cliente, gestor y despacho.
    const bGeneral = await mandato("arraigo_laboral");
    const tGeneral = bGeneral ? await textoPdf(bGeneral) : "";
    const fG = bGeneral ? await camposPdf(bGeneral) : {};
    // Marcador: la DGT. «con carácter general» NO sirve: el mandato de Aproba también lo dice.
    const DGT = /Direcci[oó]n General de Tr[aá]fico/i;
    v.ok(DGT.test(tGeneral) && !/SOLICITUD DE TRAMITES/i.test(tGeneral) && Object.keys(fG).length > 0, "«General» → impreso general del Consejo");
    v.ok(fG.mandante1 === "ZZE2E Mandato" && fG.mandante1_dni === "Y0000000Z" && fG.notif_num === "7" && fG.notif_cp === "08001" && fG.notif_localidad === "Barcelona",
      `general: cliente en sus casillas (${fG.mandante1} · ${fG.mandante1_dni} · nº ${fG.notif_num} · ${fG.notif_cp} ${fG.notif_localidad})`);
    v.ok(fG.gestor1_colegiado === "9999" && fG.colegio === "Barcelona" && Boolean(fG.gestor1) && Boolean(fG.despacho) && fG.mandante2 === "" && fG.gestor2 === "",
      `general: gestor en la 1.ª fila, despacho «${fG.despacho}», el resto en blanco`);

    // 5) Servicio marcado «El de Aproba» → el mandato de Aproba (sin campos, sin el impreso).
    const bGen = await mandato("nie");
    const tGen = bGen ? await textoPdf(bGen) : "";
    const nGen = bGen ? Object.keys(await camposPdf(bGen)).length : -1;
    v.ok(Boolean(bGen) && !/SOLICITUD DE TRAMITES/i.test(tGen) && !DGT.test(tGen) && /MANDATO CON REPRESENTACI/i.test(tGen) && nGen === 0, "«El de Aproba» → mandato de Aproba");

    // 6) MULTI-SERVICIO: renovación de TIE (extranjería) + arraigo laboral (general) → los DOS
    //    impresos en un solo PDF. Gestor: editable, campos con prefijo; cliente: plano.
    await api(`/api/expedientes/${id}/servicio`, { body: { clave: "renovacion_tie" } });
    const rx = await api(`/api/expedientes/${id}/servicio`, { body: { extras: ["arraigo_laboral"] } });
    v.ok(rx.status === 200, `servicio adicional añadido (${rx.status} ${rx.d.error ?? ""})`);
    const rm = await fetch(`${BASE}/api/expedientes/${id}/encargo?doc=mandato`, { headers: { cookie } });
    const bMix = rm.ok ? Buffer.from(await rm.arrayBuffer()) : null;
    const pMix = bMix ? (await PDFDocument.load(bMix)).getPageCount() : 0;
    const fMix = bMix ? await camposPdf(bMix) : {};
    v.ok(pMix === 2 && fMix["ext_Dña"] === "ZZE2E Mandato" && fMix["gen_mandante1"] === "ZZE2E Mandato" && fMix["gen_gestor1_colegiado"] === "9999",
      `multi-servicio (gestor): extranjería + general en un PDF de ${pMix} páginas, campos sin chocar`);
    if (exp?.portalToken) {
      const rpm = await fetch(`${BASE}/api/portal/encargo?token=${exp.portalToken}&doc=mandato`);
      const bpm = rpm.ok ? Buffer.from(await rpm.arrayBuffer()) : null;
      const tpm = bpm ? await textoPdf(bpm) : "";
      const npm = bpm ? Object.keys(await camposPdf(bpm)).length : -1;
      v.ok(/SOLICITUD DE TRAMITES DE EXTRANJER/i.test(tpm) && DGT.test(tpm) && npm === 0, `multi-servicio (cliente): los dos impresos, aplanados (${npm} campos)`);
    }

    // 7) Interruptores SEPARADOS (supabase/mandato-activo.sql): cada documento, el suyo.
    if (conInterruptor && exp?.portalToken) {
      const estado = async () => ({
        hoja: (await fetch(`${BASE}/api/portal/encargo?token=${exp.portalToken}&doc=hoja`)).status,
        mandato: (await fetch(`${BASE}/api/portal/encargo?token=${exp.portalToken}&doc=mandato`)).status,
      });
      await admin.from("Workspace").update({ hojaEncargoActiva: true, mandatoActivo: false }).eq("id", ws);
      const a = await estado();
      v.ok(a.hoja === 200 && a.mandato === 404, `solo la hoja → hoja ${a.hoja}, mandato ${a.mandato}`);
      await admin.from("Workspace").update({ hojaEncargoActiva: false, mandatoActivo: true }).eq("id", ws);
      const b = await estado();
      v.ok(b.hoja === 404 && b.mandato === 200, `solo el mandato → hoja ${b.hoja}, mandato ${b.mandato}`);
    } else if (!conInterruptor) console.log("  ⚠️ supabase/mandato-activo.sql sin aplicar: interruptores separados no comprobados");
  } finally {
    if (antes) await admin.from("Workspace").update(antes).eq("id", ws);
    await fx.limpiar();
  }
  const { data: despues } = await admin.from("Workspace").select(cols).eq("id", ws).maybeSingle();
  v.ok(JSON.stringify(despues) === JSON.stringify(antes), "config de la demo restaurada");
  return v.resumen();
}
