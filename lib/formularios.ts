import type { Expediente } from "./types";
import type { ClienteFicha } from "./ficha";
import { normalizaPais, normalizaNacionalidad } from "./paises";

// Génère les formulaires officiels remplis à partir des données d'un expediente.
// v1 : EX-10 (arraigo / circunstancias excepcionales) + tasa 790-012.
// Les valeurs sont agrégées depuis les données extraites par l'IA des documents.

export type Campo = { label: string; value: string; ancho?: "full" | "half" | "third" };
export type Seccion = { titulo: string; campos: Campo[] };
export type Formulario = {
  tipo: string;
  titulo: string;
  organismo: string;
  secciones: Seccion[];
  casillas?: { label: string; marcada: boolean }[];
};

// Agrège tous les champs extraits des documents en un dictionnaire { label: value }.
function datosExtraidos(exp: Expediente): Record<string, string> {
  const m: Record<string, string> = {};
  for (const d of exp.documentos) {
    for (const c of d.extraction?.campos ?? []) m[c.label] = c.value;
  }
  return m;
}

const G = (m: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (m[k]) return m[k];
  return "—";
};

export function buildFormularios(exp: Expediente): Formulario[] {
  const m = datosExtraidos(exp);
  // Nom : extraction IA d'abord, sinon repli sur la fiche cliente (toujours fiable).
  const cn = exp.clienteNombre && exp.clienteNombre !== "—" ? exp.clienteNombre.trim() : "";
  let nombre = G(m, "Nombre");
  let apellidos = G(m, "Apellidos");
  if (nombre === "—" && cn) nombre = cn.split(/\s+/)[0];
  if (apellidos === "—" && cn) apellidos = cn.split(/\s+/).slice(1).join(" ") || "—";
  const ncRaw = G(m, "Nombre completo");
  const nombreCompleto = ncRaw !== "—" ? ncRaw : (cn || `${nombre} ${apellidos}`.replace(/—/g, "").trim() || "—");
  const sexo = G(m, "Sexo");
  const nacionalidad = G(m, "Nacionalidad");
  const pasaporte = G(m, "Nº pasaporte");
  const nie = G(m, "NIE");
  const nacimiento = G(m, "Fecha de nacimiento");
  const domicilio = G(m, "Dirección");
  const municipio = G(m, "Municipio");
  const provincia = G(m, "Provincia");
  const empleador = G(m, "Empleador");
  const puesto = G(m, "Puesto");
  const salario = G(m, "Salario bruto anual", "Salario");

  const ex10: Formulario = {
    tipo: "EX-10",
    titulo: "Solicitud de autorización de residencia temporal por circunstancias excepcionales",
    organismo: "Ministerio del Interior · Secretaría de Estado de Migraciones",
    casillas: [
      { label: "Arraigo social", marcada: exp.tipoLabel.toLowerCase().includes("arraigo social") },
      { label: "Arraigo laboral", marcada: exp.tipoLabel.toLowerCase().includes("arraigo laboral") },
      { label: "Arraigo familiar", marcada: false },
      { label: "Razones humanitarias", marcada: false },
    ],
    secciones: [
      {
        titulo: "1 · Datos del extranjero",
        campos: [
          { label: "Primer apellido", value: apellidos.split(" ")[0] ?? apellidos, ancho: "half" },
          { label: "Segundo apellido", value: apellidos.split(" ").slice(1).join(" ") || "—", ancho: "half" },
          { label: "Nombre", value: nombre, ancho: "half" },
          { label: "Sexo", value: sexo, ancho: "half" },
          { label: "Nacionalidad", value: nacionalidad, ancho: "third" },
          { label: "Fecha de nacimiento", value: nacimiento, ancho: "third" },
          { label: "Estado civil", value: "—", ancho: "third" },
          { label: "Nº de pasaporte", value: pasaporte, ancho: "half" },
          { label: "NIE (si dispone)", value: nie, ancho: "half" },
        ],
      },
      {
        titulo: "2 · Domicilio en España",
        campos: [
          { label: "Domicilio", value: domicilio, ancho: "full" },
          { label: "Municipio", value: municipio, ancho: "half" },
          { label: "Provincia", value: provincia, ancho: "half" },
        ],
      },
      {
        titulo: "3 · Medios económicos / relación laboral",
        campos: [
          { label: "Empleador", value: empleador, ancho: "half" },
          { label: "Puesto", value: puesto, ancho: "half" },
          { label: "Retribución bruta anual", value: salario, ancho: "full" },
        ],
      },
    ],
  };

  const tasa: Formulario = {
    tipo: "790-012",
    titulo: "Tasa 790 · Código 012 — Autorizaciones de residencia y trabajo",
    organismo: "Ministerio del Interior · Modelo de autoliquidación",
    secciones: [
      {
        titulo: "Sujeto pasivo",
        campos: [
          { label: "Apellidos y nombre", value: nombreCompleto, ancho: "full" },
          { label: "NIE / Pasaporte", value: nie !== "—" ? nie : pasaporte, ancho: "half" },
          { label: "Nacionalidad", value: nacionalidad, ancho: "half" },
          { label: "Domicilio", value: domicilio, ancho: "full" },
        ],
      },
      {
        titulo: "Autoliquidación",
        campos: [
          { label: "Concepto", value: "2.2 — Autorización de residencia temporal", ancho: "full" },
          { label: "Importe", value: "38,28 €", ancho: "third" },
          { label: "Forma de pago", value: "En efectivo / adeudo en cuenta", ancho: "third" },
          { label: "Fecha de devengo", value: exp.creado, ancho: "third" },
        ],
      },
    ],
  };

  return [ex10, tasa];
}

// ── Données normalisées pour le remplissage des PDF officiels ────────────────
export type DatosForm = {
  pasaporte: string; nie1: string; nie2: string; nie3: string;
  apellido1: string; apellido2: string; nombre: string; sexo: "H" | "M" | "X" | "";
  estadoCivil: "S" | "C" | "V" | "D" | "Sp" | "";
  fechaD: string; fechaM: string; fechaA: string;
  lugarNac: string; paisNac: string; nacionalidad: string;
  nombrePadre: string; nombreMadre: string;
  domicilio: string; numero: string; piso: string; localidad: string; cp: string; provincia: string;
  telefono: string; email: string;
};

const limpio = (v: string) => (v && v !== "—" ? v.trim() : "");

export function datosNormalizados(exp: Expediente): DatosForm {
  const m = datosExtraidos(exp);
  const fi = exp.clienteFicha ?? {};
  const cn = exp.clienteNombre && exp.clienteNombre !== "—" ? exp.clienteNombre.trim() : "";
  // Priorité : ficha (saisie par le client) → extraction IA des documents.
  const pref = (fichaVal: string | undefined, ...keys: string[]) => limpio(fichaVal ?? "") || limpio(G(m, ...keys));

  // Apellidos / nombre : ficha → extraction → repli sur le nom complet du Cliente.
  let apellidos = limpio(fi.apellidos ?? "") || limpio(G(m, "Apellidos"));
  let nombre = pref(fi.nombre, "Nombre");
  if (!nombre && cn) nombre = cn.split(/\s+/)[0];
  if (!apellidos && cn) apellidos = cn.split(/\s+/).slice(1).join(" ");
  const apellido1 = apellidos.split(/\s+/)[0] ?? "";
  const apellido2 = apellidos.split(/\s+/).slice(1).join(" ");

  // Documento : NIE (X/Y/Z + dígitos) vs pasaporte selon le format.
  const docFicha = limpio(fi.numeroDocumento ?? "").toUpperCase().replace(/[\s-]/g, "");
  const esNie = (s: string) => /^[XYZ]\d/.test(s);
  const nieRaw = (esNie(docFicha) ? docFicha : "") || limpio(G(m, "NIE")).toUpperCase().replace(/[\s-]/g, "");
  const nm = nieRaw.match(/^([XYZ])(\d{1,8})([A-Z])?$/);
  const [nie1, nie2, nie3] = nm ? [nm[1], nm[2], nm[3] ?? ""] : ["", "", ""];
  const pasaporte = (docFicha && !esNie(docFicha) ? docFicha : "") || limpio(G(m, "Nº pasaporte"));

  // Fecha de nacimiento → d / m / a (ficha ISO ou extraction).
  const fSrc = limpio(fi.fechaNacimiento ?? "") || limpio(G(m, "Fecha de nacimiento"));
  let fechaD = "", fechaM = "", fechaA = "";
  const iso = fSrc.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const esp = fSrc.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (iso) { fechaA = iso[1]; fechaM = iso[2]; fechaD = iso[3]; }
  else if (esp) { fechaD = esp[1]; fechaM = esp[2]; fechaA = esp[3]; }

  // Sexo : ficha (H/M/X) → extraction (non ambigu).
  let sexo: "H" | "M" | "X" | "" = (fi.sexo === "H" || fi.sexo === "M" || fi.sexo === "X") ? fi.sexo : "";
  if (!sexo) { const sx = limpio(G(m, "Sexo")).toUpperCase(); sexo = /^(F|FEM|MUJ)/.test(sx) ? "M" : /^(MASC|HOMB|VAR)/.test(sx) ? "H" : ""; }

  const estadoCivil = (["S", "C", "V", "D", "Sp"] as const).find((v) => v === fi.estadoCivil) ?? "";

  return {
    pasaporte, nie1, nie2, nie3,
    apellido1, apellido2, nombre, sexo, estadoCivil,
    // « Nombre del padre / de la madre » = los nombres reales que el cliente
    // rellena en su ficha (NO derivar del apellido: la casilla pide el NOMBRE
    // del progenitor). Si no los rellenó, van vacíos.
    nombrePadre: pref(fi.nombrePadre), nombreMadre: pref(fi.nombreMadre),
    fechaD, fechaM, fechaA,
    lugarNac: pref(fi.lugarNacimiento, "Lugar de nacimiento"),
    // País y nacionalidad → forma española ("France"→"Francia", "FR"→"Francés/a").
    paisNac: normalizaPais(pref(fi.paisNacimiento)),
    nacionalidad: normalizaNacionalidad(pref(fi.nacionalidad, "Nacionalidad"), sexo),
    domicilio: pref(fi.via, "Dirección"),
    numero: limpio(fi.numeroVia ?? ""), piso: limpio(fi.piso ?? ""),
    localidad: pref(fi.municipio, "Municipio"),
    cp: pref(fi.codigoPostal, "Código postal"),
    provincia: pref(fi.provincia, "Provincia"),
    telefono: limpio(fi.telefono ?? "") || limpio(exp.clienteTelefono ?? ""),
    email: limpio(fi.email ?? "") || limpio(exp.clienteEmail ?? ""),
  };
}

// Variante CLIENT (sans expediente) : remplit un formulaire officiel depuis la SEULE
// ficha du cliente — indépendamment d'un service/expediente. Réutilise toute la
// normalisation via un expediente factice sans documents.
export function datosDeCliente(ficha: ClienteFicha, nombreCompleto: string, telefono?: string | null, email?: string | null): DatosForm {
  const fakeExp = {
    clienteFicha: ficha,
    clienteNombre: nombreCompleto,
    clienteTelefono: telefono ?? "",
    clienteEmail: email ?? "",
    documentos: [],
  } as unknown as Expediente;
  return datosNormalizados(fakeExp);
}
