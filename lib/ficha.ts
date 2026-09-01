// Fiche du solicitante — source unique des données personnelles, remplie par le
// client dans le portail, complétée par l'extraction IA, lue par tous les
// formulaires (EX + 790). Mêmes clés partout (portail, route, Cliente, formularios).

export type ClienteFicha = {
  nombre?: string;
  apellidos?: string;
  sexo?: string; // H | M | X
  fechaNacimiento?: string; // ISO AAAA-MM-DD
  lugarNacimiento?: string;
  paisNacimiento?: string;
  nacionalidad?: string;
  numeroDocumento?: string; // NIE (X/Y/Z + dígitos)
  pasaporte?: string;
  estadoCivil?: string; // S | C | V | D | Sp
  nombrePadre?: string;
  nombreMadre?: string;
  via?: string;
  numeroVia?: string;
  piso?: string;
  codigoPostal?: string;
  municipio?: string;
  provincia?: string;
  telefono?: string;
  email?: string;
};

export const FICHA_KEYS: (keyof ClienteFicha)[] = [
  "nombre", "apellidos", "sexo", "fechaNacimiento", "lugarNacimiento", "paisNacimiento",
  "nacionalidad", "numeroDocumento", "pasaporte", "estadoCivil", "nombrePadre", "nombreMadre",
  "via", "numeroVia", "piso", "codigoPostal", "municipio", "provincia", "telefono", "email",
];

export const SEXOS = [["", "—"], ["M", "Mujer"], ["H", "Hombre"], ["X", "Indefinido"]] as const;
export const ESTADOS_CIVILES = [["", "—"], ["S", "Soltero/a"], ["C", "Casado/a"], ["V", "Viudo/a"], ["D", "Divorciado/a"], ["Sp", "Separado/a"]] as const;

// Champs du portail (groupés). req = utile pour les formulaires (on marque, sans bloquer).
// type/inputMode/ac (autocomplete): teclado correcto + autorrelleno del navegador en el
// móvil del migrante — la ficha de 17 campos deja de ser un castigo.
export const FICHA_CAMPOS: { k: keyof ClienteFicha; label: string; grupo: "Identidad" | "Domicilio" | "Contacto"; tipo?: "sexo" | "estadoCivil" | "date" | "tel"; w?: "full" | "half"; type?: string; inputMode?: "numeric" | "tel" | "email"; ac?: string }[] = [
  { k: "nombre", label: "Nombre", grupo: "Identidad", w: "half", ac: "given-name" },
  { k: "apellidos", label: "Apellidos", grupo: "Identidad", w: "half", ac: "family-name" },
  { k: "sexo", label: "Sexo", grupo: "Identidad", tipo: "sexo", w: "half" },
  { k: "estadoCivil", label: "Estado civil", grupo: "Identidad", tipo: "estadoCivil", w: "half" },
  { k: "fechaNacimiento", label: "Fecha de nacimiento", grupo: "Identidad", tipo: "date", w: "half", ac: "bday" },
  { k: "nacionalidad", label: "Nacionalidad", grupo: "Identidad", w: "half" },
  { k: "lugarNacimiento", label: "Lugar de nacimiento (ciudad)", grupo: "Identidad", w: "half" },
  { k: "paisNacimiento", label: "País de nacimiento", grupo: "Identidad", w: "half" },
  { k: "numeroDocumento", label: "NIE", grupo: "Identidad", w: "half" },
  { k: "pasaporte", label: "Pasaporte / doc. de identidad", grupo: "Identidad", w: "half" },
  // Padre y madre: los modelos EX los piden (EX-18 y todos los vectoriales los mapean) y
  // `camposQueFaltan` ya avisaba de su ausencia — pero no había DÓNDE escribirlos salvo
  // el portal o una importación. Petición de Juan (01/09/2026): el gestor los teclea aquí.
  { k: "nombrePadre", label: "Nombre del padre", grupo: "Identidad", w: "half" },
  { k: "nombreMadre", label: "Nombre de la madre", grupo: "Identidad", w: "half" },
  { k: "via", label: "Domicilio (calle, plaza…)", grupo: "Domicilio", w: "full", ac: "street-address" },
  { k: "numeroVia", label: "Número", grupo: "Domicilio", w: "half", inputMode: "numeric" },
  { k: "piso", label: "Piso / puerta", grupo: "Domicilio", w: "half" },
  { k: "codigoPostal", label: "Código postal", grupo: "Domicilio", w: "half", inputMode: "numeric", ac: "postal-code" },
  { k: "municipio", label: "Municipio", grupo: "Domicilio", w: "half", ac: "address-level2" },
  { k: "provincia", label: "Provincia", grupo: "Domicilio", w: "half", ac: "address-level1" },
  // tipo "tel" → los formularios lo pintan con <TelefonoInput> (prefijo internacional).
  { k: "telefono", label: "Teléfono", grupo: "Contacto", tipo: "tel", w: "half", type: "tel", inputMode: "tel", ac: "tel" },
  { k: "email", label: "Email", grupo: "Contacto", w: "half", type: "email", inputMode: "email", ac: "email" },
];

export const GRUPOS: ("Identidad" | "Domicilio" | "Contacto")[] = ["Identidad", "Domicilio", "Contacto"];

export const fichaVacia = (): ClienteFicha => Object.fromEntries(FICHA_KEYS.map((k) => [k, ""])) as ClienteFicha;

// ── Datos que el formulario oficial SABE rellenar ────────────────────────────
// Los modelos EX marcan/escriben todos estos campos desde la ficha del cliente.
// Si están vacíos, el PDF sale incompleto — y antes eso pasaba EN SILENCIO
// (caso real 17/08/2026: «en el formulario EX no marca el estado civil», con
// estadoCivil y sexo vacíos en la ficha). `piso` y `apellidos`(2º) quedan fuera
// a propósito: faltan legítimamente en muchísimas fichas y avisar de ellos sería
// ruido. `pasaporte`/`numeroDocumento` cuentan como UNO: basta con tener uno.
const CAMPOS_DEL_FORMULARIO: (keyof ClienteFicha)[] = [
  "nombre", "apellidos", "sexo", "estadoCivil", "fechaNacimiento", "nacionalidad",
  "lugarNacimiento", "paisNacimiento", "nombrePadre", "nombreMadre",
  "via", "numeroVia", "codigoPostal", "municipio", "provincia", "telefono", "email",
];

// Devuelve las ETIQUETAS de los datos que el formulario dejará en blanco.
// Orden estable (el de la ficha) para que el aviso no baile entre renders.
export function camposQueFaltan(ficha: Partial<ClienteFicha> | null | undefined): string[] {
  const f = ficha ?? {};
  const vacio = (k: keyof ClienteFicha) => !String(f[k] ?? "").trim();
  const faltan: string[] = [];
  for (const c of FICHA_CAMPOS) {
    if (!CAMPOS_DEL_FORMULARIO.includes(c.k)) continue;
    if (vacio(c.k)) faltan.push(c.label);
  }
  // Documento: el formulario pide NIE y/o pasaporte; con uno de los dos no se avisa.
  if (vacio("numeroDocumento") && vacio("pasaporte")) faltan.push("NIE o pasaporte");
  return faltan;
}
