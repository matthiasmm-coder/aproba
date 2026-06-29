// Normaliza país y nacionalidad al ESPAÑOL para los formularios oficiales.
// El cliente puede escribir un código ("FR"), el país en otro idioma ("France",
// "Maroc") o la nacionalidad; aquí lo convertimos a la forma española esperada
// por los modelos EX. Si no se reconoce, se devuelve el valor tal cual (sin romper).

type Pais = { pais: string; nac: string; nacM?: string; alias: string[] };

// nac = forma por defecto (femenina o invariable) · nacM = masculina (si difiere).
const PAISES: Pais[] = [
  { pais: "España", nac: "Española", nacM: "Español", alias: ["es", "esp", "spain", "espagne", "spanish", "espana", "espanola", "espanol", "espagnole", "espagnol"] },
  { pais: "Francia", nac: "Francesa", nacM: "Francés", alias: ["fr", "fra", "france", "french", "francaise", "francais"] },
  { pais: "Marruecos", nac: "Marroquí", alias: ["ma", "mar", "morocco", "maroc", "marocaine", "marocain"] },
  { pais: "Argelia", nac: "Argelina", nacM: "Argelino", alias: ["dz", "dza", "algeria", "algerie", "algerien"] },
  { pais: "Colombia", nac: "Colombiana", nacM: "Colombiano", alias: ["co", "col", "colombie", "colombian"] },
  { pais: "Venezuela", nac: "Venezolana", nacM: "Venezolano", alias: ["ve", "ven", "venezuelan"] },
  { pais: "Ecuador", nac: "Ecuatoriana", nacM: "Ecuatoriano", alias: ["ec", "ecu", "equateur", "ecuadorian"] },
  { pais: "Perú", nac: "Peruana", nacM: "Peruano", alias: ["pe", "per", "peru", "perou", "peruvian"] },
  { pais: "Honduras", nac: "Hondureña", nacM: "Hondureño", alias: ["hn", "hnd", "honduran"] },
  { pais: "Bolivia", nac: "Boliviana", nacM: "Boliviano", alias: ["bo", "bol", "bolivian"] },
  { pais: "Argentina", nac: "Argentina", nacM: "Argentino", alias: ["ar", "arg", "argentine", "argentinian"] },
  { pais: "República Dominicana", nac: "Dominicana", nacM: "Dominicano", alias: ["do", "dom", "dominican", "republicadominicana", "rd"] },
  { pais: "Brasil", nac: "Brasileña", nacM: "Brasileño", alias: ["br", "bra", "brazil", "bresil", "brasil", "brazilian", "brasileiro", "brasileira"] },
  { pais: "Paraguay", nac: "Paraguaya", nacM: "Paraguayo", alias: ["py", "pry", "paraguayan"] },
  { pais: "Cuba", nac: "Cubana", nacM: "Cubano", alias: ["cu", "cub", "cuban"] },
  { pais: "Nicaragua", nac: "Nicaragüense", alias: ["ni", "nic", "nicaraguan"] },
  { pais: "Chile", nac: "Chilena", nacM: "Chileno", alias: ["cl", "chl", "chili", "chilean"] },
  { pais: "México", nac: "Mexicana", nacM: "Mexicano", alias: ["mx", "mex", "mexico", "mexique", "mexican"] },
  { pais: "China", nac: "China", nacM: "Chino", alias: ["cn", "chn", "chine", "chinese"] },
  { pais: "Pakistán", nac: "Pakistaní", alias: ["pk", "pak", "pakistan", "pakistani"] },
  { pais: "India", nac: "India", nacM: "Indio", alias: ["in", "ind", "indian", "inde"] },
  { pais: "Bangladés", nac: "Bangladesí", alias: ["bd", "bgd", "bangladesh", "bangladeshi"] },
  { pais: "Filipinas", nac: "Filipina", nacM: "Filipino", alias: ["ph", "phl", "philippines", "filipino", "filipina"] },
  { pais: "Senegal", nac: "Senegalesa", nacM: "Senegalés", alias: ["sn", "sen", "senegalese", "senegalais"] },
  { pais: "Nigeria", nac: "Nigeriana", nacM: "Nigeriano", alias: ["ng", "nga", "nigerian"] },
  { pais: "Malí", nac: "Maliense", alias: ["ml", "mli", "mali", "malian"] },
  { pais: "Gambia", nac: "Gambiana", nacM: "Gambiano", alias: ["gm", "gmb", "gambian"] },
  { pais: "Ghana", nac: "Ghanesa", nacM: "Ghanés", alias: ["gh", "gha", "ghanaian"] },
  { pais: "Guinea", nac: "Guineana", nacM: "Guineano", alias: ["gn", "gin", "guinee", "guinean"] },
  { pais: "Camerún", nac: "Camerunesa", nacM: "Camerunés", alias: ["cm", "cmr", "cameroon", "cameroun", "cameroonian"] },
  { pais: "Rumanía", nac: "Rumana", nacM: "Rumano", alias: ["ro", "rou", "romania", "roumanie", "romanian"] },
  { pais: "Bulgaria", nac: "Búlgara", nacM: "Búlgaro", alias: ["bg", "bgr", "bulgarian"] },
  { pais: "Ucrania", nac: "Ucraniana", nacM: "Ucraniano", alias: ["ua", "ukr", "ukraine", "ukrainian"] },
  { pais: "Rusia", nac: "Rusa", nacM: "Ruso", alias: ["ru", "rus", "russia", "russie", "russian"] },
  { pais: "Italia", nac: "Italiana", nacM: "Italiano", alias: ["it", "ita", "italy", "italie", "italian"] },
  { pais: "Reino Unido", nac: "Británica", nacM: "Británico", alias: ["gb", "uk", "gbr", "unitedkingdom", "royaumeuni", "british", "england", "inglaterra"] },
  { pais: "Portugal", nac: "Portuguesa", nacM: "Portugués", alias: ["pt", "prt", "portuguese", "portugaise"] },
  { pais: "Alemania", nac: "Alemana", nacM: "Alemán", alias: ["de", "deu", "germany", "allemagne", "german", "deutschland"] },
  { pais: "Polonia", nac: "Polaca", nacM: "Polaco", alias: ["pl", "pol", "poland", "pologne", "polish"] },
  { pais: "Estados Unidos", nac: "Estadounidense", alias: ["us", "usa", "unitedstates", "etatsunis", "american", "eeuu"] },
  { pais: "Georgia", nac: "Georgiana", nacM: "Georgiano", alias: ["ge", "geo", "georgian"] },
  { pais: "Armenia", nac: "Armenia", nacM: "Armenio", alias: ["am", "arm", "armenian"] },
];

// NFD descompone los acentos y luego [^a-z] elimina marcas, espacios y signos.
const norm = (s: string) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");

// Índice: cada clave normalizada (iso, alias, país, nacionalidad) → registro.
const INDICE: Record<string, Pais> = {};
for (const p of PAISES) {
  for (const k of [p.pais, p.nac, p.nacM ?? "", ...p.alias]) {
    const n = norm(k);
    if (n && !INDICE[n]) INDICE[n] = p;
  }
}

function buscar(input: string): Pais | undefined {
  return INDICE[norm(input)];
}

/** Devuelve el país en español ("France"→"Francia"); si no se reconoce, el valor original. */
export function normalizaPais(input: string): string {
  const v = (input ?? "").trim();
  if (!v) return "";
  return buscar(v)?.pais ?? v;
}

/** Devuelve la nacionalidad en español ("FR"→"Francés/Francesa" según sexo); si no, el original. */
export function normalizaNacionalidad(input: string, sexo?: "H" | "M" | "X" | ""): string {
  const v = (input ?? "").trim();
  if (!v) return "";
  const p = buscar(v);
  if (!p) return v;
  return sexo === "H" && p.nacM ? p.nacM : p.nac;
}
