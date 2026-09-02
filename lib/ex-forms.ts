import "server-only";
import { SERVICIO_A_TIPO } from "@/lib/tramites";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, TextAlignment, PDFName, PDFString, PDFTextField, type PDFForm } from "pdf-lib";
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
  // `nie`: [fin du libellé N.I.E., début « -- », fin « -- », début « - », fin « - »] relevés
  // par probe (scripts). Sans lui, la géométrie majoritaire. Antes había un x fijo para
  // TODOS los modelos: la casilla nie1 se comía el separador « -- » (caso Juan, 02/09).
  // `marcas`: CENTRES réels des carrés à cocher [sexo X,H,M] et [ec S,C,V,D,Sp], relevés
  // au ruban sur le PDF. Sans eux, on retombe sur l'heuristique « fin du libellé + n »,
  // qui vise juste pour certaines cases et rate les autres (la croix touchait le bord).
  ov?: { fx?: [number, number, number]; pisoX?: number; nie?: [number, number, number, number, number];
         marcas?: { sexo: [number, number, number]; ec: [number, number, number, number, number] };
         // Centre VERTICAL des cadres (raster). Sans lui, y = ligne du libellé − 1 : jusqu'à
         // 2,3 pt trop bas. Les cadres de la p.1 font 13×15 pt, pas 7×8 comme les « □ » de la p.2.
         marcasY?: { sexo: number; ec: number };
         // Bornes mesurées là où la boîte d'un champ mordait un libellé imprimé
         // (défauts antérieurs : « Nº » contre « Piso », « fechaA » contre « Lugar »,
         // « provincia » contre son propre libellé sur l'EX-15).
         limites?: { numeroX?: number; numeroW?: number; fechaAW?: number; provinciaX?: number; provinciaW?: number; nombreW?: number; pisoW?: number };
         // Retouches x/w par clé, pour un modèle dont un libellé est ailleurs (EX-02 : « 2º Apellido » à 292).
         ajustes?: Partial<Record<keyof DatosForm, Partial<Pos>>> },
): MapaOverlay {
  // La case suit son libellé : X ≈ fin du libellé + bord de case (+11 lettre seule, +16 « Sp », +20 « X * »).
  const y = (v: number) => v - 1;
  const fx = ov?.fx ?? [130, 158, 184];
  // Tramos NIE déduits des séparateurs : chaque casilla vit ENTRE deux repères imprimés,
  // avec 3-4 pt de marge pour ne jamais mordre dessus.
  const [nl, s1a, s1b, s2a, s2b] = ov?.nie ?? [321.4, 353.8, 358.1, 507.8, 510];
  // La croix est dessinée en (x, y) taille 10 : son centre optique est à x+3,35.
  // Pour la poser au milieu du carré, on part du centre et on recule d'autant.
  const mc = (centro: number) => centro - 3.35;
  const ms = ov?.marcas;
  const my = ov?.marcasY;
  const ySexo = my ? my.sexo - 3.6 : y(sx[0]);
  const yEc = my ? my.ec - 3.6 : y(ec[0]);
  const mapa: MapaOverlay = {
    modo: "overlay",
    coords: {
      pasaporte: { x: 112, y: t.P, w: 185 },
      nie1: { x: nl + 4, y: t.P, w: s1a - nl - 7 },
      nie2: { x: s1b + 3, y: t.P, w: s2a - s1b - 6 },
      nie3: { x: s2b + 3, y: t.P, w: 28 },
      apellido1: { x: 115, y: t.A }, apellido2: { x: 390, y: t.A },
      nombre: { x: 92, y: t.N, w: ov?.limites?.nombreW },
      fechaD: { x: fx[0], y: t.F }, fechaM: { x: fx[1], y: t.F }, fechaA: { x: fx[2], y: t.F, w: ov?.limites?.fechaAW ?? 38 },
      lugarNac: { x: 262, y: t.F }, paisNac: { x: 458, y: t.F },
      nacionalidad: { x: 115, y: t.NAC },
      nombrePadre: { x: pm[1] + 92, y: pm[0] }, nombreMadre: { x: pm[2] + 90, y: pm[0] },
      // Nº : le créneau « Nº … Piso » fait 35 pt ; à 18 pt de large « 145 » perdait son 5.
      domicilio: { x: 150, y: t.D }, numero: { x: ov?.limites?.numeroX ?? 487, y: t.D, w: ov?.limites?.numeroW ?? 30 },
      // Piso : 25 pt entre « Piso » et le cadre → corps 7, sinon « 3º 2ª » ne rentre pas.
      piso: { x: ov?.pisoX ?? 537, y: t.D, size: 7, w: ov?.limites?.pisoW },
      localidad: { x: 105, y: t.L }, cp: { x: 360, y: t.L }, provincia: { x: ov?.limites?.provinciaX ?? 460, y: t.L, w: ov?.limites?.provinciaW },
      telefono: { x: 128, y: t.T }, email: { x: 305, y: t.T },
    },
    sexoMarks: {
      X: { x: ms ? mc(ms.sexo[0]) : sx[1] + 20, y: ySexo },
      H: { x: ms ? mc(ms.sexo[1]) : sx[2] + 11, y: ySexo },
      M: { x: ms ? mc(ms.sexo[2]) : sx[3] + 11, y: ySexo },
    },
    estadoCivilMarks: {
      S: { x: ms ? mc(ms.ec[0]) : ec[1] + 11, y: yEc },
      C: { x: ms ? mc(ms.ec[1]) : ec[2] + 11, y: yEc },
      V: { x: ms ? mc(ms.ec[2]) : ec[3] + 11, y: yEc },
      D: { x: ms ? mc(ms.ec[3]) : ec[4] + 11, y: yEc },
      Sp: { x: ms ? mc(ms.ec[4]) : ec[5] + 16, y: yEc },
    },
  };
  for (const [k, aj] of Object.entries(ov?.ajustes ?? {})) {
    const pos = mapa.coords[k as keyof DatosForm];
    if (pos && aj) Object.assign(pos, aj);
  }
  return mapa;
}

export const FORMS: Record<string, Mapa> = {
  // ── Modèles vectoriels (overlay) — positions relevées via pdfjs ────────────
  "EX-31": vec({ P: 683.9, A: 665.8, N: 647.2, F: 628.9, NAC: 610.3, D: 574.1, L: 556, T: 537.7 }, [651, 461, 501, 525], [612, 404, 433, 461, 490, 519], [592.2, 56, 305], { fx: [152, 179, 205], pisoX: 542, nie: [327, 359.4, 363.8, 513.5, 515.7], limites: { numeroX: 492, numeroW: 30, fechaAW: 28 }, marcas: { sexo: [480.2, 513.2, 543.9], ec: [421.4, 450.1, 478.7, 507.8, 535] }, marcasY: { sexo: 652.3, ec: 615.4 } }),
  "EX-02": vec({ P: 686.2, A: 668, N: 649.4, F: 631.2, NAC: 612.6, D: 576.4, L: 558.2, T: 540.1 }, [651, 336, 372, 400], [615, 396, 424, 452, 483, 512], [594.5, 51, 297], { nie: [325.4, 357.1, 359.3, 505.8, 508], limites: { numeroX: 488, numeroW: 25, nombreW: 195 }, ajustes: { apellido1: { w: 175 }, apellido2: { x: 332, w: 220 } }, marcas: { sexo: [359, 387.9, 416.5], ec: [410.3, 438.7, 470.9, 499.2, 529.7] }, marcasY: { sexo: 654.3, ec: 617.5 } }),
  "EX-03": vec({ P: 686.1, A: 668, N: 649.4, F: 631.1, NAC: 612.6, D: 576.4, L: 558.2, T: 540 }, [651, 458, 495, 519], [615, 399, 427, 456, 485, 514], [594.5, 51, 300], { marcas: { sexo: [477.4, 507.6, 538.2], ec: [415.7, 444.5, 473, 502.1, 529.3] }, marcasY: { sexo: 654.3, ec: 617.5 } }),
  "EX-15": vec({ P: 667.8, A: 649.6, N: 631, F: 613, NAC: 594.2, D: 558, L: 539.9, T: 521.8 }, [633, 468, 502, 526], [597, 406, 434, 463, 492, 521], [576.1, 51, 307], { pisoX: 548, nie: [328.5, 360.8, 365.2, 514.9, 517.1], limites: { numeroX: 499, numeroW: 30, provinciaX: 466, provinciaW: 88, pisoW: 12 }, marcas: { sexo: [484.5, 514.7, 545.3], ec: [422.8, 451.5, 480.2, 509.2, 536.4] }, marcasY: { sexo: 636.1, ec: 599.1 } }),
  "EX-17": vec({ P: 640.2, A: 622.1, N: 603.5, F: 585.4, NAC: 566.8, D: 530.5, L: 512.2, T: 494.1 }, [606, 459, 495, 519], [570, 399, 427, 456, 485, 514], [548.6, 51, 300], { marcas: { sexo: [476.7, 507.6, 541.9], ec: [415.7, 444.5, 473, 502.1, 532.4] }, marcasY: { sexo: 608.5, ec: 571.6 } }),
  "EX-01": vec({ P: 663.1, A: 644.9, N: 626.2, F: 608.1, NAC: 589.4, D: 553.1, L: 535, T: 516.8 }, [627, 458, 495, 519], [591, 399, 427, 456, 485, 514], [571.3, 51, 300], { nie: [328.7, 358.8, 361, 507.8, 510], marcas: { sexo: [475.1, 507.4, 538.5], ec: [415.7, 444.5, 473, 502.2, 529.3] }, marcasY: { sexo: 631.3, ec: 594.4 } }),
  // Autorización de regreso — pedido por el 1er cliente real (Juan, 2026-07). Layout estándar.
  "EX-13": vec({ P: 626.5, A: 608.4, N: 589.8, F: 571.6, NAC: 553, D: 516.8, L: 498.6, T: 480.4 }, [592, 457, 495, 519], [555, 399, 427, 456, 485, 514], [534.9, 51, 300], { marcas: { sexo: [476.4, 507.6, 538.2], ec: [415.7, 444.5, 473, 502.1, 529.3] }, marcasY: { sexo: 594.7, ec: 557.9 } }),
  "EX-11": vec({ P: 663.2, A: 645.1, N: 626.4, F: 608.2, NAC: 589.6, D: 553.2, L: 535.1, T: 517 }, [627, 458, 495, 519], [591, 399, 427, 456, 485, 514], [571.4, 51, 300], { marcas: { sexo: [477.4, 507.6, 538.2], ec: [415.7, 444.5, 473, 502.1, 529.3] }, marcasY: { sexo: 631.3, ec: 594.5 } }),
  // Layout EX-01 estándar (etiquetas x=51), solo cambian las filas Y (probe pdfjs).
  "EX-18": vec({ P: 640.1, A: 621.9, N: 603.3, F: 585.2, NAC: 566.6, D: 530.3, L: 512.1, T: 493.9 }, [604, 458, 495, 519], [568, 399, 427, 456, 485, 514], [548.5, 51, 300], { marcas: { sexo: [472.8, 507.6, 538.2], ec: [415.8, 444.5, 473, 502.2, 529.3] }, marcasY: { sexo: 608.5, ec: 571.5 } }),
  "EX-23": vec({ P: 640.2, A: 622.1, N: 603.5, F: 585.4, NAC: 566.8, D: 530.5, L: 512.2, T: 494.1 }, [604, 460, 495, 519], [569, 399, 427, 456, 485, 514], [548.6, 51, 300], { nie: [328.7, 358.8, 361, 507.8, 510], marcas: { sexo: [477.9, 507.6, 541.9], ec: [415.7, 444.5, 473, 502.1, 532.4] }, marcasY: { sexo: 608.3, ec: 571.6 } }),
  "EX-26": vec({ P: 675.4, A: 657.3, N: 638.7, F: 620.4, NAC: 601.8, D: 565.6, L: 547.3, T: 529.2 }, [639, 458, 495, 519], [604, 399, 427, 456, 485, 514], [583.7, 51, 300], { marcas: { sexo: [477.4, 507.6, 538.2], ec: [415.7, 444.5, 473, 502.2, 529.3] }, marcasY: { sexo: 643.6, ec: 606.9 } }),
  // EX-32 (7 pág., familia DA): etiquetas desplazadas +5 (x=56); fecha/piso a calibrar al render.
  "EX-32": vec({ P: 670.2, A: 652.1, N: 633.6, F: 615.5, NAC: 596.8, D: 560.5, L: 542.4, T: 524.4 }, [634, 461, 501, 525], [599, 404, 433, 461, 490, 519], [578.6, 56, 305], { fx: [152, 179, 205], pisoX: 542, nie: [327, 359.4, 363.8, 513.5, 515.7], limites: { numeroX: 492, numeroW: 30, fechaAW: 28 }, marcas: { sexo: [480.1, 513.2, 543.9], ec: [421.4, 450.1, 478.7, 507.8, 535] }, marcasY: { sexo: 638.6, ec: 601.7 } }),

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
    { P: 429.4, A: 411.2, N: 392.6, F: 374.4, NAC: 354.6, D: 318.4, L: 301.1, T: 284 },
    [396, 337, 371, 400],
    [357, 387, 414, 441, 471, 498],
    [336.5, 51, 295],
    // Le bloc reagrupado est plus étroit : « N.I.E. » finit à 305 (et non 321), ses
    // séparateurs sont à 337 et 486. Avant, les cases NIE reprenaient la géométrie du
    // bloc principal et mordaient sur les tirets (invisible au test de recouvrement,
    // qui ne générait pas ce bloc — corrigé le 02/09/2026).
    // Bloc reagrupado, plus étroit que le principal (probe) : « Nº » 443→451, « Piso » 486→500,
    // « C.P. » 316→330, « Provincia » 402→433. Les boîtes suivent SES libellés.
    { nie: [305, 337, 339, 486, 488], limites: { nombreW: 195 }, marcas: { sexo: [359.2, 387, 416], ec: [402.1, 430.2, 457.7, 487.1, 516.1] }, marcasY: { sexo: 397.5, ec: 360.1 },
      ajustes: { apellido1: { w: 175 }, apellido2: { x: 332, w: 220 }, domicilio: { w: 290 }, numero: { x: 454, w: 29 }, piso: { x: 504 }, cp: { x: 336 }, provincia: { x: 438 } } },
  );
  delete m.coords.telefono;
  delete m.coords.email;
  m.coords.pasaporte!.w = 172; // « N.I.E. » du bloc reagrupado commence à 287
  return m;
})();
// Case p.2 « Menor de 18 años representada legalmente por el reagrupante » : carré mesuré au
// raster x 238,9→246,1 · y 662,4→669,7, centre (242,5, 666). La croix corps 10 a son centre
// optique en (x+3,35, y+3,6) → x = 239,2, y = 662,4. Avant (240, 662) elle débordait sur « M ».
const EX02_MENOR_REPRESENTADO: Pos = { x: 238.7, y: 662.4, page: 1 }; // 0,5 pt à gauche du centre : la boîte 11×11 ne touche pas « Menor »

// EX-31 / EX-32 (arraigo RD 1155/2024), bloc p.2 « EN EL CASO DE MENORES, PADRE/MADRE/TUTOR… » :
// identité du représentant (le padre/madre/tutor du solicitante mineur). Coordonnées relevées
// par probe pdfjs ; mêmes conventions d'offset que la section 1 (valeur à droite du libellé,
// croix à +11/+16/+20 du libellé). Le bloc n'a PAS de lignes domicilio/contact.
// NB: la rangée PARENTESCO (Hijo/Cónyuge/Ascendiente) a des cases vectorielles non résolubles
// par probe → on ne la coche pas (le gestor la marque à la revue).
// `c` : centres MESURÉS (raster) des cadres Sexo [X,H,M] et Estado civil [S,C,V,D,Sp] de ce bloc.
function menorBloc(y: { P: number; A: number; N: number; SX: number; F: number; LP: number; NAC: number; EC: number; PM: number },
                   c: { sexo: [number, number][]; ec: [number, number][] }): MapaOverlay {
  const pg = 1; // page 2 (index 0-based)
  const at = (x: number, yy: number): Pos => ({ x, y: yy, page: pg });
  return {
    modo: "overlay",
    coords: {
      // N.I.E. finit à 327, tirets à 359-364 et 513-516 (probe p.2, EX-31 et EX-32 identiques).
      // Avant : nie1 à 362 (SUR le tiret), nie3 à 545 (26 pt trop à droite, hors conduite),
      // apellido2 à 468 (la boîte sortait de la page).
      pasaporte: at(117, y.P), nie1: { ...at(331, y.P), w: 25 }, nie2: { ...at(367, y.P), w: 143 }, nie3: { ...at(519, y.P), w: 28 },
      apellido1: at(120, y.A), apellido2: at(390, y.A),
      nombre: at(97, y.N),
      fechaD: at(152, y.F), fechaM: at(179, y.F), fechaA: { ...at(205, y.F), w: 28 },
      lugarNac: at(266, y.LP), paisNac: at(460, y.LP),
      nacionalidad: at(115, y.NAC),
      nombrePadre: at(148, y.PM), nombreMadre: at(395, y.PM),
    },
    // Croix corps 10 : centre optique en (x+3,35, y+3,6) → on recule d'autant depuis le centre du cadre.
    sexoMarks: { X: at(c.sexo[0][0] - 3.35, c.sexo[0][1] - 3.6), H: at(c.sexo[1][0] - 3.35, c.sexo[1][1] - 3.6), M: at(c.sexo[2][0] - 3.35, c.sexo[2][1] - 3.6) },
    estadoCivilMarks: Object.fromEntries((["S", "C", "V", "D", "Sp"] as const).map((k, i) => [k, at(c.ec[i][0] - 3.35, c.ec[i][1] - 3.6)])) as MapaOverlay["estadoCivilMarks"],
  };
}
// Rangées relevées: EX-31 p2 (labels y: PASAPORTE 750, Apellidos 732, Nombre 713/Sexo 715,
// Fecha 693/Lugar-País 695, Nacionalidad-EC 676, padre/madre 658) ; EX-32 p2 (735, 717,
// 698/700, 678/680, 662, 644).
const MENOR_BLOC: Record<string, MapaOverlay> = {
  "EX-31": menorBloc({ P: 748, A: 729.9, N: 711.4, SX: 715, F: 693.3, LP: 693.3, NAC: 674.6, EC: 676, PM: 656.4 }, { sexo: [[480.2, 716.9], [513.2, 716.4], [543.9, 716.4]], ec: [[421.4, 679.6], [450.1, 679.6], [478.7, 679.6], [507.8, 679.6], [535, 679.6]] }),
  "EX-32": menorBloc({ P: 733.4, A: 715.1, N: 696.6, SX: 700, F: 678.5, LP: 678.5, NAC: 659.9, EC: 662, PM: 641.6 }, { sexo: [[480.1, 702], [513.2, 701.5], [543.9, 701.5]], ec: [[421.4, 664.8], [450.1, 664.8], [478.7, 664.8], [507.8, 664.8], [535, 664.8]] }),
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
// ── Hauteur du texte : UNE règle pour tous les champs, tous les modèles (02/09/2026) ──
// Ligne de base du texte = haut de l'encre des pointillés + 2 pt. Les pointillés sont
// mesurés au RASTER (rendu 8 px/pt du modèle vierge), jamais déduits des libellés : selon
// la police du modèle, la conduite est dessinée 4-5 pt SOUS la ligne de base de son
// glyphe (« ␣ » large de l'EX-01) ou 1 pt AU-DESSUS (« … » de l'EX-18). Les anciennes
// coordonnées, calées à l'œil sur les libellés et arrondies à l'entier, plaçaient le texte
// entre 6 pt au-dessus de la ligne (EX-31 apellidos) et 1,4 pt DEDANS (EX-18 p.2).
// La boîte se pose CAJA_DY sous cette ligne de base : pdf-lib dessine 3,77 pt au-dessus
// du bas de la boîte (h 14 / corps 9) et Aperçu 4,2 — les deux tombent à ±0,25 pt.
const CAJA_DY = 4;
type Blank = { name: string; x: number; y: number; w: number; h?: number; size?: number; page?: number; centrar?: boolean };
// Casilla: campo 13×13 sobre el glifo □ (misma transformación que las marcas X: x-0.5/y-4).
// Le glyphe « carré » fait 7,2 pt de large et ~8 pt de haut, posé sur sa ligne de base.
// L'ancien champ (13×13 calé en bas à gauche) débordait à droite et sous le carré : la
// croix tombait décentrée et le champ mordait le libellé (cas Juan, 02/09). Ici le champ
// est CENTRÉ sur le carré, texte centré dedans, donc la croix tombe pile au milieu.
const CAJA_W = 7.2, CAJA_H = 8;
const caja = (name: string, gx: number, gy: number): Blank => ({
  name, x: gx + CAJA_W / 2 - 5.5, y: gy + CAJA_H / 2 - 5.5, w: 11, h: 11, size: 8, page: 1, centrar: true,
});
// ── Page 1 : champs que la ficha ne remplit JAMAIS ────────────────────────────────
// Sections 2) « representante a efectos de presentación » et 3) « domicilio a efectos de
// notificaciones » : Aproba ne modélise pas ces personnes, donc rien ne s'y écrivait et
// aucune case n'était créée — le gestor ne pouvait pas les remplir du tout (Juan, 02/09).
// Positions déduites des libellés relevés par probe : chaque champ occupe l'espace ENTRE
// la fin d'un libellé et le début du suivant.
const t1 = (name: string, x: number, y: number, w: number): Blank => ({ name, x, y: y - CAJA_DY, w, h: 14, size: 9, page: 0 });
// Idem page 2. Corps 8 : les lignes y sont plus serrées que sur la page 1.
const t2 = (name: string, x: number, y: number, w: number, size = 8): Blank => ({ name, x, y: y - (size === 7 ? 4.4 : CAJA_DY), w, h: 13, size, page: 1 });
const P1_BLANKS: Record<string, Blank[]> = {
  "EX-18": [
    // 2) Representante a efectos de presentación
    t1("r_nombre", 126, 402.6, 294), t1("r_dni", 473, 402.6, 70),
    t1("r_domicilio", 122, 385.6, 339), t1("r_numero", 477, 385.6, 26), t1("r_piso", 525, 385.6, 20),
    t1("r_localidad", 86, 368.6, 176), t1("r_cp", 284, 368.6, 62), t1("r_provincia", 385, 368.6, 158),
    t1("r_telefono", 102, 351.6, 133), t1("r_email", 264, 351.6, 279),
    t1("r_replegal", 160, 334.5, 196), t1("r_repdni", 407, 334.5, 52), t1("r_reptitulo", 491, 334.5, 52),
    // 1) « Representante legal, en su caso » — la rangée du bloc SOLICITANTE, oubliée
    // au premier passage (rótulos : fin 156,2 · DNI 369,8→413,5 · Título 482,6→507,2).
    t1("s_replegal", 160, 479.3, 206), t1("s_repdni", 417, 479.3, 62), t1("s_reptitulo", 511, 479.3, 32),
    // 3) Domicilio a efectos de notificaciones
    t1("n_nombre", 126, 257.9, 296), t1("n_dni", 474, 257.9, 70),
    t1("n_domicilio", 122, 240.7, 345), t1("n_numero", 483, 240.7, 20), t1("n_piso", 524, 240.7, 20),
    t1("n_localidad", 86, 223.8, 178), t1("n_cp", 286, 223.8, 62), t1("n_provincia", 387, 223.8, 156),
    t1("n_telefono", 102, 206.9, 134), t1("n_email", 265, 206.9, 278),
    // Consentement notifications électroniques (Dehú)
    { ...caja("consiento", 48.1, 175.3), page: 0 },
  ],
};

const P2_BLANKS: Record<string, Blank[]> = {
  "EX-17": [caja("inicial", 77, 669), caja("renovacion", 77, 650), caja("duplicado", 77, 630)],
  "EX-15": [
    caja("nie", 69, 675), caja("certificado", 405, 675), caja("cert_residente", 417, 662), caja("cert_noresidente", 417, 648),
    caja("mot_economicos", 69, 593), caja("mot_profesionales", 263, 593), caja("mot_sociales", 441, 593), caja("mot_otros", 69, 568),
    { name: "especificar", x: 130, y: 546 - CAJA_DY, w: 395, h: 14, size: 9, page: 1 },
    caja("lugar_oficina", 69, 479), caja("lugar_comisaria", 263, 479), caja("lugar_consular", 476, 479),
    caja("sit_estancia", 69, 418), caja("sit_residencia", 228, 418),
  ],
  "EX-18": [
    // Toutes les conduites de points de la p.2 sont équipées. Bornes calculées par
    // métriques de police, calibrées sur la largeur réelle de chaque ligne (probe).
    // « PERÍODO PREVISTO … » : les points vont de 230,9 à 323,9 (demande de Juan).
    t2("periodo_previsto", 233, 710.9, 88),
    // « FECHA DE INICIO … (2) …../…../…… » : TROIS créneaux, comme l'imprimé.
    // Aperçu rogne dès que la valeur dépasse (largeur − 6) : seuil mesuré au banc
    // PDFKit, w=13 perd un chiffre, w=14 passe. Les boîtes du jour et du mois mordent
    // donc de 2 pt sur le « / » imprimé — invisible (champ sans bordure), et le glyphe
    // rendu reste dans son créneau. Le corps 6,5 était illusoire : PDFKit arrondit à 7.
    t2("fecha_inicio_d", 509, 710.9, 14, 7), t2("fecha_inicio_m", 522.6, 710.9, 14, 7), t2("fecha_inicio_a", 536.2, 710.9, 24, 7),
    t2("n_familiares", 366, 689.8, 84),
    t2("ue_documento", 266, 589.2, 113),
    t2("ue_vinculo", 258, 576, 121),
    t2("p_otros_txt", 94, 361.2, 231),
    t2("m_otros_txt", 97, 282.7, 202),
    t2("baja_causa_txt", 141, 246.1, 399),
    // Pied de page : « DIRIGIDA A … Código DIR3 … PROVINCIA … »
    t2("dirigida_a", 72, 33, 272), t2("codigo_dir3", 393, 33, 46), t2("provincia_pie", 487, 33, 54),
    caja("res_temporal", 54, 671), caja("t_cuenta_ajena", 69, 657), caja("t_cuenta_propia", 69, 642), caja("t_no_activo", 69, 628), caja("t_estudiante", 69, 614), caja("t_nacional_ue", 69, 599),
    caja("res_permanente", 54, 555), caja("p_5anos", 66, 542), caja("p_jub_3anos", 66, 527), caja("p_jub_conyuge", 66, 513), caja("p_jub_nac", 66, 498),
    caja("p_jubant_3anos", 66, 474), caja("p_jubant_conyuge", 66, 460), caja("p_jubant_nac", 66, 445),
    caja("p_incap_2anos", 66, 431), caja("p_incap_accidente", 66, 416), caja("p_incap_conyuge", 66, 402), caja("p_incap_nac", 66, 387), caja("p_3anos_em", 66, 373), caja("p_otros", 66, 358),
    caja("modificacion", 54, 338), caja("m_datos", 69, 321), caja("m_domicilio", 69, 307), caja("m_documento", 69, 294), caja("m_otros", 69, 280),
    caja("baja", 54, 260), caja("baja_causa", 69, 243),
    caja("veracidad", 41, 215),
  ],
};

// ── Página 2: línea «………, a … de … de …» (lugar y fecha de la firma) ────────────
// Pedido por Juan: hacerla EDITABLE. La línea es idéntica en todos los modelos (mismos
// offsets relativos, medidos por probe pdfjs); solo cambian el x de inicio y la y. Se emiten
// 4 campos vacíos (lugar / día / mes / año) sobre los tramos punteados, SOLO en modo editable.
// `corto`: EX-02 a une ligne 7,3 pt plus courte (un « … » de moins dans le tramo du
// lieu) — tout ce qui suit la virgule est donc décalé d'autant vers la gauche.
// y = haut de l'encre des pointillés + 2 (raster) — voir CAJA_DY. Le « … » de cette
// ligne dessine ses points ~1 pt AU-DESSUS de sa ligne de base pdfjs : caler le texte sur
// cette base le faisait passer DANS les points (constat Matthias, 02/09/2026).
const LUGAR_FECHA: Record<string, { x0: number; y: number; corto?: boolean }> = {
  "EX-02": { x0: 259.7, y: 211.6, corto: true }, "EX-10": { x0: 282.1, y: 89.6 }, "EX-15": { x0: 256, y: 337.2 },
  "EX-17": { x0: 256, y: 494.2 }, "EX-18": { x0: 256, y: 200.1 }, "EX-19": { x0: 256, y: 308 },
  "EX-31": { x0: 282.1, y: 542.1 }, "EX-32": { x0: 282.1, y: 449 },
};
// Offsets relevés au repère visuel sur EX-18 (ligne identique sur EX-10/15/17/31/32,
// largeur 261,7 pt). Avant, « día » commençait sur le « a » de « , a » : le texte tapé
// se superposait à la lettre imprimée (cas Juan, 02/09).
function camposLugarFecha(code: string): Blank[] {
  const lf = LUGAR_FECHA[code];
  if (!lf) return [];
  const { x0, y } = lf;
  const d = lf.corto ? 7.3 : 0;
  const b = (name: string, dx: number, w: number, size = 9): Blank => ({ name, x: x0 + dx, y: y - CAJA_DY, w, h: size === 8 ? 13 : 14, size, page: 1 });
  // Lieu en corps 8 : le créneau imprimé fait 96 pt et « Hospitalet de Llobregat » en fait 97 en corps 9.
  return [b("lf_lugar", 0, 96 - d, 8), b("lf_dia", 109 - d, 17), b("lf_mes", 139 - d, 78), b("lf_ano", 230 - d, 40)];
}

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

// ── Sceller le /DA sur le WIDGET, pas seulement sur le champ ────────────────────────
// Aperçu (PDFKit) n'hérite PAS le /DA du /Parent : sans /DA sur l'annotation elle-même,
// il retombe sur Helvetica 12 pt pour TOUS les champs. À 12 pt « 2026 » fait 26,7 pt et
// se fait rogner en « 202 » dans un créneau de 24 pt — le défaut vu par Matthias le
// 02/09/2026. Chrome, lui, hérite correctement : d'où un bug invisible selon le lecteur.
// Le /DA doit tenir sur UNE SEULE LIGNE : pdf-lib l'écrit « rg\n/Helvetica 7 Tf » et le
// saut de ligne casse la lecture par PDFKit (taille ET couleur).
// À appeler APRÈS updateFieldAppearances, qui réécrit sinon ce qu'on vient de poser.
function sellarDA(form: PDFForm) {
  for (const f of form.getFields()) {
    if (!/^[fbm]_/.test(f.getName())) continue; // seulement NOS champs
    const da = f.acroField.getDefaultAppearance?.();
    const m = da?.match(/\/([A-Za-z0-9#_+-]+)\s+([\d.]+)\s+Tf/);
    if (!m) continue;
    const linea = `/${m[1]} ${m[2]} Tf 0.06 0.09 0.28 rg`;
    f.acroField.setDefaultAppearance(linea);
    for (const w of f.acroField.getWidgets()) w.dict.set(PDFName.of("DA"), PDFString.of(linea));
  }
}

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
    // p.2 «Nombre y apellidos del titular» (se repite): campo AcroForm existente, sin rellenar.
    // Pedido por Juan — se rellena con el nombre del interesado (queda editable, como todo acroform).
    const nombreTitular = [datos.nombre, datos.apellido1, datos.apellido2].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
    if (nombreTitular) try { const f = form.getTextField("Nombre y apellidos del titular"); f.setText(limpiar(nombreTitular)); f.setFontSize(9); } catch { /* campo ausente en otros acroform */ }
    // p.2 línea «lugar y fecha»: en modo editable, campos vacíos sobre los tramos punteados.
    if (opts?.editable) {
      // Les champs du Ministère sont en taille AUTOMATIQUE (« /Helv 0 Tf ») : Aperçu la
      // convertit en 12 pt, et dans ses créneaux de 13-18 pt de large un « 31 » perd un
      // chiffre. Corps explicite partout, adapté à la largeur (le nom /Helv est dans /DR).
      for (const f of form.getFields()) {
        if (!(f instanceof PDFTextField) || f.getName().startsWith("f_")) continue;
        const w = f.acroField.getWidgets()[0]?.getRectangle().width ?? 100;
        try { f.setFontSize(w < 18 ? 6 : w < 22 ? 7 : 9); } catch { /* champ sans /DA */ }
      }
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const pg2 = pdf.getPages()[1];
      for (const b of camposLugarFecha(code)) {
        if (!pg2) break;
        const f = form.createTextField(`f_${b.name}`);
        f.addToPage(pg2, { x: b.x, y: b.y, width: b.w, height: b.h ?? 14, font, textColor: TINTA, borderWidth: 0, backgroundColor: undefined, borderColor: undefined });
        f.setFontSize(b.size ?? 9);
      }
    }
    try { form.updateFieldAppearances(); } catch { /* ignore */ }
    if (opts?.editable) sellarDA(form);
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
  const marcasPuestas: { page: number; cx: number; cy: number }[] = [];
  // Campo AcroForm SIN borde ni fondo: las claves deben estar PRESENTES (aunque sea
  // undefined) — si faltan, pdf-lib pone fondo blanco y borde negro (PDFTextField.addToPage).
  const crearCampo = (pg: (typeof pages)[number], name: string, o: { x: number; y: number; w: number; h: number; size: number; valor?: string; centrar?: boolean }) => {
    const f = form!.createTextField(uniq(name));
    if (o.centrar) f.setAlignment(TextAlignment.Center);
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
  // Chaque largeur = le créneau imprimé (fin du libellé → début du libellé suivant, ou
  // bord du cadre à 558), moins une marge. Aperçu rogne dès que le texte dépasse
  // (largeur − 6) et, dès qu'on touche UN champ, il régénère TOUS les autres : un
  // « HOSPITALET DE LLOBREGAT » pré-rempli se tronquait dans une boîte de 120.
  const ANCHO: Record<string, number> = {
    apellido1: 220, apellido2: 165, nombre: 240, domicilio: 300, localidad: 200,
    nacionalidad: 200, lugarNac: 160, paisNac: 95, nombrePadre: 150, nombreMadre: 165,
    email: 250, provincia: 95, pasaporte: 100, telefono: 130, cp: 55,
    numero: 30, piso: 22, nie1: 24, nie2: 100, nie3: 24, fechaD: 24, fechaM: 24, fechaA: 38,
  };
  const estampar = (pos: Pos | undefined, txt: string, size = 9, key = "campo") => {
    if (!pos) return;
    const pg = pages[pos.page ?? 0];
    if (!pg) return;
    // Sin valor: en PDF plano no se dibuja nada, pero en modo EDITABLE se crea igualmente
    // la casilla vacía — si no, un dato ausente en la ficha deja una línea donde el gestor
    // NO puede escribir (petición de Juan, 01/09/2026). Las marcas X no se crean vacías.
    if (!txt && (!editable || !form || key === "sexo" || key === "ec")) return;
    const sz = pos.size ?? size;
    if (!editable || !form) { pg.drawText(txt, { x: pos.x, y: pos.y, size: sz, font, color: TINTA }); return; }
    const esMarca = txt === "X" && !(key in ANCHO);
    if (!txt && esMarca) return;
    if (esMarca) {
      // Croix plate dessinée en (x, y) corps 10 → centre optique (x+3,35, y+3,6). La boîte
      // 11×11 se centre dessus, texte centré : comme les casillas de la p.2. Avant, une
      // boîte 13×14 calée en bas à gauche mordait le libellé voisin (« Menor », EX-02 p.2).
      const cx = pos.x + 3.35, cy = pos.y + 3.6;
      marcasPuestas.push({ page: pos.page ?? 0, cx, cy });
      crearCampo(pg, `f_${key}`, { x: cx - 5.5, y: cy - 5.5, w: 11, h: 11, size: 8, valor: txt, centrar: true });
      return;
    }
    crearCampo(pg, `f_${key}`, {
      x: pos.x - 1, y: pos.y - CAJA_DY,
      w: pos.w ?? ANCHO[key] ?? 120, h: sz + 5, size: sz, valor: txt,
    });
  };
  for (const [key, pos] of Object.entries(mapa.coords)) {
    estampar(pos, limpiar((datos[key as keyof DatosForm] as string) || ""), 9, key);
  }
  // Sexo / estado civil. En PLAT: une seule croix, celle de la ficha (inchangé).
  // En ÉDITABLE: une case par option, cochable à la main — sinon une ficha sans sexe
  // laissait des carrés que le gestor ne pouvait pas cocher (Juan, 02/09). La case est
  // CENTRÉE sur le carré imprimé, comme celles de la page 2.
  if (!editable || !form) {
    if (datos.sexo) estampar(mapa.sexoMarks?.[datos.sexo], "X", 10, "sexo");
    if (datos.estadoCivil) estampar(mapa.estadoCivilMarks?.[datos.estadoCivil], "X", 10, "ec");
  } else {
    const casilla = (grupo: string, clave: string, pos: Pos | undefined, marcada: boolean) => {
      if (!pos) return;
      const pg = pages[pos.page ?? 0];
      if (!pg) return;
      // La croix plate est dessinée en (x, y) taille 10 → son centre optique est à
      // (x + 3.35, y + 3.6). On centre un champ de 11×11 là-dessus.
      crearCampo(pg, `m_${grupo}_${clave}`, {
        x: pos.x + 3.35 - 5.5, y: pos.y + 3.6 - 5.5, w: 11, h: 11, size: 8,
        valor: marcada ? "X" : undefined, centrar: true,
      });
    };
    for (const k of ["X", "H", "M"] as const) casilla("sexo", k, mapa.sexoMarks?.[k], datos.sexo === k);
    for (const k of ["S", "C", "V", "D", "Sp"] as const) casilla("ec", k, mapa.estadoCivilMarks?.[k], datos.estadoCivil === k);
  }

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
    // Línea «lugar y fecha» (pedido por Juan) + casillas/campos vacíos específicos del modelo.
    for (const b of [...(P1_BLANKS[code] ?? []), ...camposLugarFecha(code), ...(P2_BLANKS[code] ?? [])]) {
      const pg = pages[b.page ?? 1];
      if (!pg) continue;
      // Une casilla vide n'est pas créée là où la croix du trámite est déjà posée (même centre à 3 pt près).
      if (b.centrar && marcasPuestas.some((m) => m.page === (b.page ?? 1) && Math.abs(m.cx - (b.x + b.w / 2)) < 3 && Math.abs(m.cy - (b.y + (b.h ?? 14) / 2)) < 3)) continue;
      crearCampo(pg, `b_${b.name}`, { x: b.x, y: b.y, w: b.w, h: b.h ?? 14, size: b.size ?? 9, centrar: b.centrar });
    }
    try { form.updateFieldAppearances(font); } catch { /* ignore */ }
    sellarDA(form);
  }
  return pdf.save();
}
