import "server-only";
import { SERVICIO_A_TIPO } from "@/lib/tramites";
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

type Pos = { x: number; y: number; page?: number; size?: number; w?: number };
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
  // Autorización de regreso — pedido por el 1er cliente real (Juan, 2026-07). Layout estándar.
  "EX-13": vec({ P: 628, A: 610, N: 592, F: 572, NAC: 555, D: 518, L: 500, T: 482 }, [592, 457, 495, 519], [555, 399, 427, 456, 485, 514], [537, 51, 300]),
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
// ⚠️ Ce bloc N'A PAS de ligne teléfono/email (la section 2 « representante » commence à y=269)
// → on retire ces deux coordonnées pour ne pas estampiller dans le vide.
const EX02_REAGRUPADO = (() => {
  const m = vec(
    { P: 431, A: 413, N: 394, F: 374, NAC: 357, D: 320, L: 302, T: 284 },
    [396, 337, 371, 400],
    [357, 387, 414, 441, 471, 498],
    [338, 51, 295],
  );
  delete m.coords.telefono;
  delete m.coords.email;
  return m;
})();
// Case p.2 « Menor de 18 años representada legalmente por el reagrupante » (probe: y=663 x=238).
const EX02_MENOR_REPRESENTADO: Pos = { x: 240, y: 662, page: 1 };

// EX-31 / EX-32 (arraigo RD 1155/2024), bloc p.2 « EN EL CASO DE MENORES, PADRE/MADRE/TUTOR… » :
// identité du représentant (le padre/madre/tutor du solicitante mineur). Coordonnées relevées
// par probe pdfjs ; mêmes conventions d'offset que la section 1 (valeur à droite du libellé,
// croix à +11/+16/+20 du libellé). Le bloc n'a PAS de lignes domicilio/contact.
// NB: la rangée PARENTESCO (Hijo/Cónyuge/Ascendiente) a des cases vectorielles non résolubles
// par probe → on ne la coche pas (le gestor la marque à la revue).
function menorBloc(y: { P: number; A: number; N: number; SX: number; F: number; LP: number; NAC: number; EC: number; PM: number }): MapaOverlay {
  const pg = 1; // page 2 (index 0-based)
  const at = (x: number, yy: number): Pos => ({ x, y: yy, page: pg });
  return {
    modo: "overlay",
    coords: {
      pasaporte: at(117, y.P), nie1: at(362, y.P), nie2: at(392, y.P), nie3: at(545, y.P),
      apellido1: at(120, y.A), apellido2: at(468, y.A),
      nombre: at(97, y.N),
      fechaD: at(152, y.F), fechaM: at(179, y.F), fechaA: at(205, y.F),
      lugarNac: at(266, y.LP), paisNac: at(460, y.LP),
      nacionalidad: at(115, y.NAC),
      nombrePadre: at(148, y.PM), nombreMadre: at(395, y.PM),
    },
    sexoMarks: { X: at(481, y.SX - 1), H: at(512, y.SX - 1), M: at(536, y.SX - 1) },
    estadoCivilMarks: { S: at(415, y.EC - 1), C: at(444, y.EC - 1), V: at(472, y.EC - 1), D: at(501, y.EC - 1), Sp: at(535, y.EC - 1) },
  };
}
// Rangées relevées: EX-31 p2 (labels y: PASAPORTE 750, Apellidos 732, Nombre 713/Sexo 715,
// Fecha 693/Lugar-País 695, Nacionalidad-EC 676, padre/madre 658) ; EX-32 p2 (735, 717,
// 698/700, 678/680, 662, 644).
const MENOR_BLOC: Record<string, MapaOverlay> = {
  "EX-31": menorBloc({ P: 750, A: 732, N: 713, SX: 715, F: 693, LP: 695, NAC: 676, EC: 676, PM: 658 }),
  "EX-32": menorBloc({ P: 735, A: 717, N: 698, SX: 700, F: 678, LP: 680, NAC: 662, EC: 662, PM: 644 }),
};

// ── Page 2 «DATOS RELATIVOS A LA SOLICITUD»: casillas derivables del trámite ────────────
// Mismo concepto que los tramiteChecks del EX-10 (acroform), en overlay y keyado por
// TipoTramite. Solo se marca lo DERIVABLE sin adivinar: EX-17 4.1 (tarjeta inicial si el
// trámite es TIE, renovación si es RENOVACION) y EX-15 4.1 (NIE si el trámite es NIE).
// El resto de la p.2 (motivos, lugar, supuestos del EX-18…) lo decide el gestor a mano.
// Posiciones relevadas por probe pdfjs sobre el glifo □ (X estampada encima, y-1 como
// las demás marcas).
const TRAMITE_P2: Record<string, Record<string, Pos>> = {
  "EX-17": {
    TIE: { x: 77.5, y: 668, page: 1 },        // 4.1 □ TARJETA INICIAL (probe: 77,669)
    RENOVACION: { x: 77.5, y: 649, page: 1 }, // 4.1 □ RENOVACIÓN DE TARJETA (probe: 77,650)
    DUPLICADO: { x: 77.5, y: 629, page: 1 },  // 4.1 □ DUPLICADO POR PÉRDIDA… (probe: 77,630)
  },
  "EX-15": {
    NIE: { x: 69.5, y: 674, page: 1 },        // 4.1 □ NÚMERO DE IDENTIDAD DE EXTRANJERO (probe: 69,675)
  },
};

// Opciones de la casilla p.2 por modelo, para el selector manual de la página Formularios
// (el gestor puede forzar la casilla cuando el trámite del expediente no la determina —
// p. ej. un duplicado por pérdida, o un expediente de tipo genérico OTRO).
export const P2_OPCIONES: Record<string, { value: string; label: string }[]> = {
  "EX-17": [
    { value: "TIE", label: "Tarjeta inicial" },
    { value: "RENOVACION", label: "Renovación de tarjeta" },
    { value: "DUPLICADO", label: "Duplicado (pérdida, robo…)" },
  ],
  "EX-15": [{ value: "NIE", label: "NIE" }],
};

// ── Modo editable: campos VACÍOS de la p.2 (lo que el gestor rellena a mano) ───────────
// Posiciones relevadas por probe pdfjs (glifo □ / líneas de puntos). Solo se emiten en
// modo editable; el PDF plano queda byte-idéntico al de siempre.
type Blank = { name: string; x: number; y: number; w: number; h?: number; size?: number; page?: number };
// Casilla: campo 13×13 sobre el glifo □ (misma transformación que las marcas X: x-0.5/y-4).
const caja = (name: string, gx: number, gy: number): Blank => ({ name, x: gx - 0.5, y: gy - 4, w: 13, h: 13, size: 10, page: 1 });
const P2_BLANKS: Record<string, Blank[]> = {
  "EX-17": [caja("inicial", 77, 669), caja("renovacion", 77, 650), caja("duplicado", 77, 630)],
  "EX-15": [
    caja("nie", 69, 675), caja("certificado", 405, 675), caja("cert_residente", 417, 662), caja("cert_noresidente", 417, 648),
    caja("mot_economicos", 69, 593), caja("mot_profesionales", 263, 593), caja("mot_sociales", 441, 593), caja("mot_otros", 69, 568),
    { name: "especificar", x: 130, y: 543, w: 395, h: 13, size: 9, page: 1 },
    caja("lugar_oficina", 69, 479), caja("lugar_comisaria", 263, 479), caja("lugar_consular", 476, 479),
    caja("sit_estancia", 69, 418), caja("sit_residencia", 228, 418),
  ],
  "EX-18": [
    { name: "fecha_inicio", x: 507, y: 704, w: 72, h: 13, size: 9, page: 1 },
    caja("res_temporal", 54, 671), caja("t_cuenta_ajena", 69, 657), caja("t_cuenta_propia", 69, 642), caja("t_no_activo", 69, 628), caja("t_estudiante", 69, 614), caja("t_nacional_ue", 69, 599),
    caja("res_permanente", 54, 555), caja("p_5anos", 66, 542), caja("p_jub_3anos", 66, 527), caja("p_jub_conyuge", 66, 513), caja("p_jub_nac", 66, 498),
    caja("p_jubant_3anos", 66, 474), caja("p_jubant_conyuge", 66, 460), caja("p_jubant_nac", 66, 445),
    caja("p_incap_2anos", 66, 431), caja("p_incap_accidente", 66, 416), caja("p_incap_conyuge", 66, 402), caja("p_incap_nac", 66, 387), caja("p_3anos_em", 66, 373), caja("p_otros", 66, 358),
    caja("modificacion", 54, 338), caja("m_datos", 69, 321), caja("m_domicilio", 69, 307), caja("m_documento", 69, 294), caja("m_otros", 69, 280),
    caja("baja", 54, 260), caja("baja_causa", 69, 243),
    caja("veracidad", 41, 215),
  ],
};

export const formularioOficialDisponible = (code: string) => code in FORMS;
export const formulariosOficiales = () => Object.keys(FORMS);

// Libellés lisibles + liste complète (pour que le gestor ajoute un modèle à la main).
export const FORM_LABEL: Record<string, string> = {
  "EX-01": "Residencia no lucrativa",
  "EX-02": "Reagrupación familiar",
  "EX-03": "Residencia y trabajo (cuenta ajena)",
  "EX-10": "Arraigo (clásico)",
  "EX-11": "Larga duración",
  "EX-13": "Autorización de regreso",
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
  REAGRUPACION: ["EX-02"], RENOVACION: ["EX-17", "EX-13"], TIE: ["EX-17"], NIE: ["EX-15"],
  RESIDENCIA_LARGA: ["EX-11"], NACIONALIDAD: [],
  // OTRO / tipo non mappé → tous les modèles disponibles (le gestor choisit).
};

// Mapeo por CLAVE de servicio. Los trámites nuevos (UE / Brexit / Modificación) no son
// TipoTramite del enum: su tipo queda en OTRO, así que sus modelos se resuelven por la
// clave del servicio. Tiene PRIORIDAD sobre TRAMITE_FORMS. Conservar estas claves.
const SERVICIO_FORMS: Record<string, string[]> = {
  residencia_ue: ["EX-18"],
  autorizacion_regreso: ["EX-13"], regreso: ["EX-13"],
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
//
// Multi-servicio: acepta la(s) clave(s) del expediente — string (compat) o array
// [principal, ...extras]. Unión deduplicada, principal primero. El repli TRAMITE_FORMS
// por tipoEnum solo aplica al PRINCIPAL (los extras no tienen tipo propio; una clave
// extra sin mapeo no aporta modelos, como hoy).
export function formulariosDelTramite(tipoEnum: string, claves?: string | (string | null)[] | null): string[] {
  // El slot 0 es SIEMPRE el principal (puede ser null → repli por tipoEnum); el resto, extras.
  const lista = Array.isArray(claves) ? claves : [claves ?? null];
  const [principal, ...extrasRaw] = lista.length ? lista : [null];
  const extras = extrasRaw.filter((c): c is string => Boolean(c));
  const out: string[] = [];
  const base = principal && SERVICIO_FORMS[principal] ? SERVICIO_FORMS[principal] : (TRAMITE_FORMS[tipoEnum] ?? []);
  for (const code of base) if (!out.includes(code)) out.push(code);
  // Extras: SERVICIO_FORMS primero; las claves estándar (nie, renovacion_tie…) no están
  // ahí → repli por su tipo (SERVICIO_A_TIPO), como haría el mismo servicio de principal.
  for (const clave of extras) {
    const codes = SERVICIO_FORMS[clave] ?? TRAMITE_FORMS[SERVICIO_A_TIPO[clave] ?? ""] ?? [];
    for (const code of codes) if (!out.includes(code)) out.push(code);
  }
  return out.filter(formularioOficialDisponible);
}

// extra (expediente familiar):
//  • EX-02: reagrupado = datos de l'applicant (le bloc principal reçoit le reagrupante =
//    titulaire) ; menorRepresentado = cocher « menor representada legalmente » (p.2).
//  • EX-31/EX-32: padreTutor = identité du représentant (titulaire) pour le bloc p.2
//    « EN EL CASO DE MENORES » quand le solicitante est mineur.
// opts.editable (pedido por Juan): en lugar de texto plano, cada valor es un campo
// AcroForm sin borde/fondo → corregible en cualquier visor de PDF (adiós iLovePDF),
// y la p.2 de EX-15/17/18 recibe campos VACÍOS para escribir (casillas, especificar…).
// La descarga del CLIENTE y el ZIP siguen planos (sin opts) — un PDF manipulable no
// debe salir del despacho hacia el cliente.
export async function rellenarOficial(
  code: string, datos: DatosForm, tramite?: string,
  extra?: { reagrupado?: DatosForm; menorRepresentado?: boolean; padreTutor?: DatosForm },
  opts?: { editable?: boolean },
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
      // limpiar: un nombre en cirílico/árabe/chino (lo habitual en extranjería) fuera de
      // WinAnsi haría lanzar a pdf-lib al regenerar apariencias y mataría TODO el PDF.
      try { const f = form.getTextField(fieldName); f.setText(limpiar(value)); f.setFontSize(9); } catch { /* champ absent */ }
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
  const editable = Boolean(opts?.editable);
  const form = editable ? pdf.getForm() : null;
  // createTextField LANZA con nombres duplicados (los bloques EX-02 reagrupado y
  // EX-31/32 menor reutilizan las mismas claves) → sufijo correlativo.
  const usados = new Map<string, number>();
  const uniq = (base: string) => {
    const b = base.replace(/[^A-Za-z0-9_]/g, "");
    const n = (usados.get(b) ?? 0) + 1; usados.set(b, n);
    return n === 1 ? b : `${b}_${n}`;
  };
  // Posiciones donde ya se estampó una marca X (para no superponer un campo vacío encima).
  const marcasPuestas = new Set<string>();
  // Campo AcroForm SIN borde ni fondo: las claves deben estar PRESENTES (aunque sea
  // undefined) — si faltan, pdf-lib pone fondo blanco y borde negro (PDFTextField.addToPage).
  const crearCampo = (pg: (typeof pages)[number], name: string, o: { x: number; y: number; w: number; h: number; size: number; valor?: string }) => {
    const f = form!.createTextField(uniq(name));
    if (o.valor) f.setText(o.valor);
    // addToPage ANTES de setFontSize: la entrada /DA del campo solo existe tras crear el
    // widget (si no, pdf-lib lanza MissingDAEntryError).
    f.addToPage(pg, {
      x: o.x, y: o.y, width: o.w, height: o.h,
      font, textColor: TINTA,
      borderWidth: 0, backgroundColor: undefined, borderColor: undefined,
    });
    f.setFontSize(o.size);
  };
  // Anchos de campo por clave de la ficha (solo modo editable).
  const ANCHO: Record<string, number> = {
    apellido1: 150, apellido2: 150, nombre: 130, domicilio: 160, localidad: 120,
    nacionalidad: 130, lugarNac: 120, paisNac: 110, nombrePadre: 130, nombreMadre: 130,
    email: 160, provincia: 110, pasaporte: 100, telefono: 85, cp: 55,
    numero: 34, piso: 40, nie1: 24, nie2: 100, nie3: 24, fechaD: 24, fechaM: 24, fechaA: 38,
  };
  const estampar = (pos: Pos | undefined, txt: string, size = 9, key = "campo") => {
    if (!pos) return;
    const pg = pages[pos.page ?? 0];
    if (!pg || !txt) return;
    const sz = pos.size ?? size;
    if (!editable || !form) { pg.drawText(txt, { x: pos.x, y: pos.y, size: sz, font, color: TINTA }); return; }
    const esMarca = txt === "X" && !(key in ANCHO);
    if (esMarca) marcasPuestas.add(`${pos.page ?? 0}:${Math.round(pos.x)},${Math.round(pos.y)}`);
    // y-3 / alto sz+5: realinea la caja del campo con la línea base del drawText plano.
    crearCampo(pg, `f_${key}`, {
      x: pos.x - 1, y: pos.y - 3,
      w: pos.w ?? ANCHO[key] ?? (esMarca ? 13 : 120), h: sz + 5, size: sz, valor: txt,
    });
  };
  for (const [key, pos] of Object.entries(mapa.coords)) {
    estampar(pos, limpiar((datos[key as keyof DatosForm] as string) || ""), 9, key);
  }
  if (datos.sexo) estampar(mapa.sexoMarks?.[datos.sexo], "X", 10, "sexo");
  if (datos.estadoCivil) estampar(mapa.estadoCivilMarks?.[datos.estadoCivil], "X", 10, "ec");

  // Page 2: casilla de tipo de trámite derivable del expediente (EX-17 inicial/renovación,
  // EX-15 NIE). Sin trámite conocido (p. ej. formulario desde la ficha del cliente) no se marca.
  if (tramite) estampar(TRAMITE_P2[code]?.[tramite], "X", 10, "p2");

  // EX-02 familiar : le bloc principal (ci-dessus) a reçu le REAGRUPANTE (titulaire) ; on
  // remplit ici le bloc REAGRUPADO avec l'applicant + la case « menor representada legalmente ».
  if (code === "EX-02" && extra?.reagrupado) {
    const r = extra.reagrupado;
    for (const [key, pos] of Object.entries(EX02_REAGRUPADO.coords)) {
      estampar(pos, limpiar((r[key as keyof DatosForm] as string) || ""), 9, key);
    }
    if (r.sexo) estampar(EX02_REAGRUPADO.sexoMarks?.[r.sexo], "X", 10, "sexo");
    if (r.estadoCivil) estampar(EX02_REAGRUPADO.estadoCivilMarks?.[r.estadoCivil], "X", 10, "ec");
    if (extra.menorRepresentado) estampar(EX02_MENOR_REPRESENTADO, "X", 10, "menor");
  }

  // EX-31/EX-32 : bloc p.2 « EN EL CASO DE MENORES » = identité du padre/madre/tutor.
  const menorBlocMapa = extra?.padreTutor ? MENOR_BLOC[code] : undefined;
  if (menorBlocMapa && extra?.padreTutor) {
    const pt = extra.padreTutor;
    for (const [key, pos] of Object.entries(menorBlocMapa.coords)) {
      estampar(pos, limpiar((pt[key as keyof DatosForm] as string) || ""), 9, key);
    }
    if (pt.sexo) estampar(menorBlocMapa.sexoMarks?.[pt.sexo], "X", 10, "sexo");
    if (pt.estadoCivil) estampar(menorBlocMapa.estadoCivilMarks?.[pt.estadoCivil], "X", 10, "ec");
  }

  // ── Modo editable: campos VACÍOS de la p.2 (EX-15/17/18) para escribir a mano lo no
  // deducible — casillas de motivos/lugar/situación/supuestos, «especificar», fecha de
  // inicio… (posiciones relevadas por probe pdfjs). Se omite cualquier casilla donde ya
  // se estampó una X (la del trámite) para no superponer dos campos.
  if (editable && form) {
    for (const b of P2_BLANKS[code] ?? []) {
      const pg = pages[b.page ?? 1];
      if (!pg) continue;
      if (marcasPuestas.has(`${b.page ?? 1}:${Math.round(b.x + 1)},${Math.round(b.y + 3)}`)) continue;
      crearCampo(pg, `b_${b.name}`, { x: b.x, y: b.y, w: b.w, h: b.h ?? 14, size: b.size ?? 9 });
    }
    try { form.updateFieldAppearances(font); } catch { /* ignore */ }
  }
  return pdf.save();
}
