import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DatosForm } from "./formularios";

// Remplissage des PDF officiels EX avec les données de l'expediente. Deux modes :
//  • acroform : le modèle a des champs remplissables (on les remplit par nom).
//  • overlay  : le modèle est plat (vectoriel) → on estampille le texte/les X aux
//    coordonnées (x,y depuis le bas) relevées via pdfjs sur le vrai modèle.
// ⚠️ Mappings établis par PROBE VISUEL : les noms de champs des AcroForm officiels
// sont DÉCALÉS (la case visuelle « Mujer » s'appelle « ChkBox », « Hombre » s'appelle
// « M », « X* » s'appelle « H » — pareil pour estado civil). Ne jamais se fier au nom.

const TINTA = rgb(0.06, 0.09, 0.28); // bleu encre, distinct du formulaire
const limpiar = (s: string) =>
  String(s ?? "").replace(/€/g, " EUR").replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[^\x00-\xFF]/g, "");

type Pos = { x: number; y: number; page?: number; size?: number };
type MapaAcro = {
  modo: "acroform";
  texto: Partial<Record<keyof DatosForm, string>>;
  checks?: { sexoX?: string; sexoH?: string; sexoM?: string };
  estadoCivil?: Record<string, string>; // S|C|V|D|Sp → nom du champ case
  tramiteChecks?: Record<string, string[]>; // tipoEnum → cases à cocher (pág.2)
};
type MapaOverlay = {
  modo: "overlay";
  coords: Partial<Record<keyof DatosForm, Pos>>;
  sexoMarks?: { X?: Pos; H?: Pos; M?: Pos };
  estadoCivilMarks?: Partial<Record<"S" | "C" | "V" | "D" | "Sp", Pos>>;
};
type Mapa = MapaAcro | MapaOverlay;

// Gabarit overlay : section 1 « Datos de la persona extranjera » (x quasi fixes),
// + marques sexo/estado civil/padre-madre aux positions relevées par formulaire.
//  t  = rows texte : P pasaporte · A apellidos · N nombre · F fecha · NAC nacionalidad · D domicilio · L localidad · T teléfono
//  sx = [y, xX*, xH, xM] (labels) · ec = [y, xS, xC, xV, xD, xSp] · pm = [y, xLabelPadre, xLabelMadre]
function vec(
  t: { P: number; A: number; N: number; F: number; NAC: number; D: number; L: number; T: number },
  sx: [number, number, number, number],
  ec: [number, number, number, number, number, number],
  pm: [number, number, number],
  ov?: { fx?: [number, number, number]; pisoX?: number }, // ajustes par modèle (labels plus longs)
): MapaOverlay {
  // La case suit son libellé : X ≈ fin du libellé + bord de case (+11 lettre seule, +16 « Sp », +20 « X * »).
  const y = (v: number) => v - 1;
  const fx = ov?.fx ?? [130, 158, 184];
  return {
    modo: "overlay",
    coords: {
      pasaporte: { x: 112, y: t.P }, nie1: { x: 340, y: t.P }, nie2: { x: 370, y: t.P }, nie3: { x: 518, y: t.P },
      apellido1: { x: 115, y: t.A }, apellido2: { x: 410, y: t.A },
      nombre: { x: 92, y: t.N },
      fechaD: { x: fx[0], y: t.F }, fechaM: { x: fx[1], y: t.F }, fechaA: { x: fx[2], y: t.F },
      lugarNac: { x: 262, y: t.F }, paisNac: { x: 458, y: t.F },
      nacionalidad: { x: 115, y: t.NAC },
      nombrePadre: { x: pm[1] + 92, y: pm[0] }, nombreMadre: { x: pm[2] + 90, y: pm[0] },
      domicilio: { x: 150, y: t.D }, numero: { x: 498, y: t.D }, piso: { x: ov?.pisoX ?? 540, y: t.D },
      localidad: { x: 105, y: t.L }, cp: { x: 360, y: t.L }, provincia: { x: 460, y: t.L },
      telefono: { x: 128, y: t.T }, email: { x: 305, y: t.T },
    },
    sexoMarks: { X: { x: sx[1] + 20, y: y(sx[0]) }, H: { x: sx[2] + 11, y: y(sx[0]) }, M: { x: sx[3] + 11, y: y(sx[0]) } },
    estadoCivilMarks: {
      S: { x: ec[1] + 11, y: y(ec[0]) }, C: { x: ec[2] + 11, y: y(ec[0]) }, V: { x: ec[3] + 11, y: y(ec[0]) },
      D: { x: ec[4] + 11, y: y(ec[0]) }, Sp: { x: ec[5] + 16, y: y(ec[0]) },
    },
  };
}

export const FORMS: Record<string, Mapa> = {
  // ── Modèles vectoriels (overlay) — positions relevées via pdfjs ────────────
  "EX-31": vec({ P: 687, A: 670, N: 649, F: 631, NAC: 613, D: 577, L: 559, T: 541 }, [651, 461, 501, 525], [612, 404, 433, 461, 490, 519], [594, 56, 305], { fx: [152, 179, 205], pisoX: 547 }),
  "EX-02": vec({ P: 687, A: 670, N: 652, F: 631, NAC: 616, D: 580, L: 562, T: 544 }, [651, 336, 372, 400], [615, 396, 424, 452, 483, 512], [597, 51, 297]),
  "EX-03": vec({ P: 687, A: 669, N: 651, F: 630, NAC: 615, D: 579, L: 561, T: 543 }, [651, 458, 495, 519], [615, 399, 427, 456, 485, 514], [597, 51, 300]),
  "EX-15": vec({ P: 669, A: 651, N: 633, F: 612, NAC: 597, D: 561, L: 543, T: 525 }, [633, 468, 502, 526], [597, 406, 434, 463, 492, 521], [579, 51, 307], { pisoX: 553 }),
  "EX-17": vec({ P: 642, A: 624, N: 606, F: 585, NAC: 570, D: 531, L: 513, T: 495 }, [606, 459, 495, 519], [570, 399, 427, 456, 485, 514], [549, 51, 300]),
  "EX-01": vec({ P: 666, A: 648, N: 627, F: 609, NAC: 591, D: 555, L: 537, T: 519 }, [627, 458, 495, 519], [591, 399, 427, 456, 485, 514], [573, 51, 300]),
  "EX-11": vec({ P: 666, A: 648, N: 627, F: 609, NAC: 591, D: 555, L: 537, T: 519 }, [627, 458, 495, 519], [591, 399, 427, 456, 485, 514], [573, 51, 300]),
  // Layout EX-01 estándar (etiquetas x=51), solo cambian las filas Y (probe pdfjs).
  "EX-18": vec({ P: 642, A: 625, N: 605, F: 585, NAC: 568, D: 532, L: 514, T: 496 }, [604, 458, 495, 519], [568, 399, 427, 456, 485, 514], [550, 51, 300]),
  "EX-23": vec({ P: 642, A: 625, N: 605, F: 585, NAC: 569, D: 532, L: 514, T: 496 }, [604, 460, 495, 519], [569, 399, 427, 456, 485, 514], [550, 51, 300]),
  "EX-26": vec({ P: 677, A: 660, N: 641, F: 620, NAC: 604, D: 567, L: 549, T: 531 }, [639, 458, 495, 519], [604, 399, 427, 456, 485, 514], [586, 51, 300]),
  // EX-32 (7 pág., familia DA): etiquetas desplazadas +5 (x=56); fecha/piso a calibrar al render.
  "EX-32": vec({ P: 672, A: 655, N: 635, F: 615, NAC: 599, D: 562, L: 544, T: 526 }, [634, 461, 501, 525], [599, 404, 433, 461, 490, 519], [580, 56, 305], { fx: [152, 179, 205], pisoX: 546 }),

  // ── EX-10 : AcroForm (noms trompeurs, mapping par probe visuel) ─────────────
  "EX-10": {
    modo: "acroform",
    texto: {
      pasaporte: "Textfield-0", nie1: "Textfield-1", nie2: "Textfield-2", nie3: "Textfield-3",
      apellido1: "CP", apellido2: "x", nombre: "Textfield-4",
      fechaD: "Fecha de nacimientoz", fechaM: "Texto-1", fechaA: "Textfield-5",
      lugarNac: "Estado civil3 S", paisNac: "Textfield-6", nacionalidad: "Textfield-7",
      nombrePadre: "Textfield-9", nombreMadre: "Piso",
      domicilio: "Provincia", numero: "Textfield-10", piso: "Textfield-11",
      localidad: "Textfield-12", cp: "Textfield-15", provincia: "Textfield-16",
      telefono: "Textfield-18", email: "DN IN IEPAS",
    },
    // Cases décalées d'un cran : la case visuelle X* = « H », Hombre = « M », Mujer = « ChkBox ».
    checks: { sexoX: "H", sexoH: "M", sexoM: "ChkBox" },
    estadoCivil: { S: "C", C: "V", V: "D", D: "Sp", Sp: "ChkBox-0" },
    tramiteChecks: {
      ARRAIGO_SOCIAL: ["RESIDENCIA INICIAL", "Arraigo Social art 1242"],
      ARRAIGO_LABORAL: ["RESIDENCIA INICIAL", "Arraigo Laboral art 1241"],
      ARRAIGO_FAMILIAR: ["RESIDENCIA INICIAL", "Arraigo Familiar art 1243"],
    },
  },
};

// EX-02 familiar: bloque « DATOS DE LA PERSONA EXTRANJERA REAGRUPADA » (l'applicant), sous
// le bloc reagrupante. Coordonnées relevées par probe (mêmes x que le reagrupante, y plus bas).
const EX02_REAGRUPADO = vec(
  { P: 431, A: 413, N: 394, F: 374, NAC: 357, D: 320, L: 302, T: 284 },
  [396, 337, 371, 400],
  [357, 387, 414, 441, 471, 498],
  [338, 51, 295],
);
// Case p.2 « Menor de 18 años representada legalmente por el reagrupante » (probe: y=663 x=238).
const EX02_MENOR_REPRESENTADO: Pos = { x: 240, y: 662, page: 1 };

export const formularioOficialDisponible = (code: string) => code in FORMS;
export const formulariosOficiales = () => Object.keys(FORMS);

// Libellés lisibles + liste complète (pour que le gestor ajoute un modèle à la main).
export const FORM_LABEL: Record<string, string> = {
  "EX-01": "Residencia no lucrativa",
  "EX-02": "Reagrupación familiar",
  "EX-03": "Residencia y trabajo (cuenta ajena)",
  "EX-10": "Arraigo (clásico)",
  "EX-11": "Larga duración",
  "EX-15": "NIE y certificados",
  "EX-17": "TIE",
  "EX-31": "Arraigo (RD 1155/2024)",
  "EX-18": "Registro/Residencia ciudadano UE",
  "EX-23": "Tarjeta Acuerdo de Retirada (Brexit)",
  "EX-26": "Modificación de autorización",
  "EX-32": "Arraigo DA 21ª (RD 1155/2024)",
};
export const formulariosDisponibles = (): { code: string; label: string }[] =>
  Object.keys(FORMS).sort().map((code) => ({ code, label: FORM_LABEL[code] ?? code }));

// Quels formulaires EX correspondent à chaque tipo de trámite (enum TipoTramite).
const TRAMITE_FORMS: Record<string, string[]> = {
  ARRAIGO_SOCIAL: ["EX-10", "EX-31", "EX-32"], ARRAIGO_LABORAL: ["EX-10", "EX-31", "EX-32"], ARRAIGO_FAMILIAR: ["EX-10", "EX-31", "EX-32"],
  REAGRUPACION: ["EX-02"], RENOVACION: ["EX-17"], TIE: ["EX-17"], NIE: ["EX-15"],
  RESIDENCIA_LARGA: ["EX-11"], NACIONALIDAD: [],
  // OTRO / tipo non mappé → tous les modèles disponibles (le gestor choisit).
};

// Mapeo por CLAVE de servicio. Los trámites nuevos (UE / Brexit / Modificación) no son
// TipoTramite del enum: su tipo queda en OTRO, así que sus modelos se resuelven por la
// clave del servicio. Tiene PRIORIDAD sobre TRAMITE_FORMS. Conservar estas claves.
const SERVICIO_FORMS: Record<string, string[]> = {
  residencia_ue: ["EX-18"],
  brexit: ["EX-23"],
  modificacion: ["EX-26"],
  arraigo_social: ["EX-10", "EX-31", "EX-32"], arraigo_laboral: ["EX-10", "EX-31", "EX-32"],
};

export function formulariosParaTramite(tipoEnum: string, servicioClave?: string | null): string[] {
  if (servicioClave && SERVICIO_FORMS[servicioClave]) return SERVICIO_FORMS[servicioClave].filter(formularioOficialDisponible);
  return (TRAMITE_FORMS[tipoEnum] ?? Object.keys(FORMS)).filter(formularioOficialDisponible);
}

// Variante SIN repli sobre "todos los modelos": solo los del trámite (vacío si no hay
// mapeo). La usa la vista del cliente: NUNCA debe ver todos los modelos, solo los de SU
// trámite. (El gestor sí usa formulariosParaTramite para poder elegir cualquiera.)
export function formulariosDelTramite(tipoEnum: string, servicioClave?: string | null): string[] {
  if (servicioClave && SERVICIO_FORMS[servicioClave]) return SERVICIO_FORMS[servicioClave].filter(formularioOficialDisponible);
  return (TRAMITE_FORMS[tipoEnum] ?? []).filter(formularioOficialDisponible);
}

// extra (EX-02 familiar): reagrupado = datos de l'applicant (le bloc principal reçoit le
// reagrupante = titulaire) ; menorRepresentado = cocher la case « menor representada
// legalmente por el reagrupante » (p.2).
export async function rellenarOficial(
  code: string, datos: DatosForm, tramite?: string,
  extra?: { reagrupado?: DatosForm; menorRepresentado?: boolean },
): Promise<Uint8Array | null> {
  const mapa = FORMS[code];
  if (!mapa) return null;
  const bytes = await readFile(path.join(process.cwd(), "forms", "ex", `${code}.pdf`));
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

  if (mapa.modo === "acroform") {
    const form = pdf.getForm();
    const marcar = (n?: string) => { if (n) try { form.getCheckBox(n).check(); } catch { /* ignore */ } };
    for (const [key, fieldName] of Object.entries(mapa.texto)) {
      const value = (datos[key as keyof DatosForm] as string) || "";
      if (!value || !fieldName) continue;
      try { const f = form.getTextField(fieldName); f.setText(value); f.setFontSize(9); } catch { /* champ absent */ }
    }
    if (datos.sexo === "X") marcar(mapa.checks?.sexoX);
    if (datos.sexo === "H") marcar(mapa.checks?.sexoH);
    if (datos.sexo === "M") marcar(mapa.checks?.sexoM);
    if (datos.estadoCivil) marcar(mapa.estadoCivil?.[datos.estadoCivil]);
    if (tramite && mapa.tramiteChecks?.[tramite]) for (const n of mapa.tramiteChecks[tramite]) marcar(n);
    try { form.updateFieldAppearances(); } catch { /* ignore */ }
    return pdf.save();
  }

  // overlay
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const estampar = (pos: Pos | undefined, txt: string, size = 9) => {
    if (!pos) return;
    const pg = pages[pos.page ?? 0];
    if (pg && txt) pg.drawText(txt, { x: pos.x, y: pos.y, size: pos.size ?? size, font, color: TINTA });
  };
  for (const [key, pos] of Object.entries(mapa.coords)) {
    estampar(pos, limpiar((datos[key as keyof DatosForm] as string) || ""));
  }
  if (datos.sexo) estampar(mapa.sexoMarks?.[datos.sexo], "X", 10);
  if (datos.estadoCivil) estampar(mapa.estadoCivilMarks?.[datos.estadoCivil], "X", 10);

  // EX-02 familiar : le bloc principal (ci-dessus) a reçu le REAGRUPANTE (titulaire) ; on
  // remplit ici le bloc REAGRUPADO avec l'applicant + la case « menor representada legalmente ».
  if (code === "EX-02" && extra?.reagrupado) {
    const r = extra.reagrupado;
    for (const [key, pos] of Object.entries(EX02_REAGRUPADO.coords)) {
      estampar(pos, limpiar((r[key as keyof DatosForm] as string) || ""));
    }
    if (r.sexo) estampar(EX02_REAGRUPADO.sexoMarks?.[r.sexo], "X", 10);
    if (r.estadoCivil) estampar(EX02_REAGRUPADO.estadoCivilMarks?.[r.estadoCivil], "X", 10);
    if (extra.menorRepresentado) estampar(EX02_MENOR_REPRESENTADO, "X", 10);
  }
  return pdf.save();
}
