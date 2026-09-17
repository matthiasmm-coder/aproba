// País ISO 3166-1 alpha-2 a partir de la nacionalidad tal y como la escriben los
// despachos en la ficha del cliente (texto libre: «colombiana», «Colombia», «Perú»,
// «deutsch», «Reino Unido»…). Lo necesita el registro VERI*FACTU de un cliente que se
// identifica con pasaporte (IDOtro tipo 03 exige el código de país). Sin acierto → null
// y el registro queda BLOQUEADO con un motivo claro; nunca se adivina un país.

const PAISES: [string, string[]][] = [
  ["AF", ["afganistan", "afgano", "afgana"]],
  ["AL", ["albania", "albanes", "albanesa"]],
  ["DZ", ["argelia", "argelino", "argelina", "algeria"]],
  ["AD", ["andorra", "andorrano", "andorrana"]],
  ["AO", ["angola", "angoleno", "angolena"]],
  ["AR", ["argentina", "argentino"]],
  ["AM", ["armenia", "armenio"]],
  ["AU", ["australia", "australiano", "australiana"]],
  ["AT", ["austria", "austriaco", "austriaca"]],
  ["AZ", ["azerbaiyan", "azerbaiyano", "azerbaiyana"]],
  ["BD", ["bangladesh", "bangladesi", "bangladeshi"]],
  ["BY", ["bielorrusia", "bielorruso", "bielorrusa", "belarus"]],
  ["BE", ["belgica", "belga", "belgium"]],
  ["BJ", ["benin", "benines", "beninesa"]],
  ["BO", ["bolivia", "boliviano", "boliviana"]],
  ["BA", ["bosnia", "bosnio", "bosnia y herzegovina"]],
  ["BR", ["brasil", "brasileno", "brasilena", "brasileiro", "brasileira", "brazil"]],
  ["BG", ["bulgaria", "bulgaro", "bulgara"]],
  ["BF", ["burkina faso", "burkines", "burkinesa"]],
  ["KH", ["camboya", "camboyano", "camboyana"]],
  ["CM", ["camerun", "camerunes", "camerunesa", "cameroun"]],
  ["CA", ["canada", "canadiense"]],
  ["CV", ["cabo verde", "caboverdiano", "caboverdiana"]],
  ["CL", ["chile", "chileno", "chilena"]],
  ["CN", ["china", "chino", "chinese"]],
  ["CO", ["colombia", "colombiano", "colombiana"]],
  ["CR", ["costa rica", "costarricense"]],
  ["CI", ["costa de marfil", "marfileno", "marfilena", "cote d'ivoire", "cote divoire"]],
  ["HR", ["croacia", "croata"]],
  ["CU", ["cuba", "cubano", "cubana"]],
  ["CZ", ["chequia", "republica checa", "checo", "checa"]],
  ["DK", ["dinamarca", "danes", "danesa"]],
  ["DO", ["republica dominicana", "dominicano", "dominicana", "rep. dominicana", "rep dominicana"]],
  ["EC", ["ecuador", "ecuatoriano", "ecuatoriana"]],
  ["EG", ["egipto", "egipcio", "egipcia"]],
  ["SV", ["el salvador", "salvador", "salvadoreno", "salvadorena"]],
  ["ES", ["espana", "espanol", "espanola", "spain", "spanish"]],
  ["EE", ["estonia", "estonio", "estonia"]],
  ["ET", ["etiopia", "etiope"]],
  ["PH", ["filipinas", "filipino", "filipina", "philippines"]],
  ["FI", ["finlandia", "finlandes", "finlandesa"]],
  ["FR", ["francia", "frances", "francesa", "france", "french"]],
  ["GM", ["gambia", "gambiano", "gambiana"]],
  ["GE", ["georgia", "georgiano", "georgiana"]],
  ["DE", ["alemania", "aleman", "alemana", "deutsch", "deutschland", "germany", "german"]],
  ["GH", ["ghana", "ghanes", "ghanesa"]],
  ["GR", ["grecia", "griego", "griega"]],
  ["GT", ["guatemala", "guatemalteco", "guatemalteca"]],
  ["GN", ["guinea", "guineano", "guineana", "guinea conakry"]],
  ["GW", ["guinea bissau", "guinea-bissau", "guineano bissau"]],
  ["GQ", ["guinea ecuatorial", "ecuatoguineano", "ecuatoguineana"]],
  ["HT", ["haiti", "haitiano", "haitiana"]],
  ["HN", ["honduras", "hondureno", "hondurena"]],
  ["HU", ["hungria", "hungaro", "hungara"]],
  ["IN", ["india", "indio", "hindu"]],
  ["ID", ["indonesia", "indonesio"]],
  ["IR", ["iran", "irani"]],
  ["IQ", ["irak", "iraq", "iraqui"]],
  ["IE", ["irlanda", "irlandes", "irlandesa", "ireland"]],
  ["IL", ["israel", "israeli"]],
  ["IT", ["italia", "italiano", "italiana", "italy", "italian"]],
  ["JM", ["jamaica", "jamaicano", "jamaicana"]],
  ["JP", ["japon", "japones", "japonesa", "japan"]],
  ["JO", ["jordania", "jordano", "jordana"]],
  ["KZ", ["kazajistan", "kazajo", "kazaja"]],
  ["KE", ["kenia", "keniano", "keniana", "kenya"]],
  ["KR", ["corea del sur", "corea", "coreano", "coreana", "south korea"]],
  ["XK", ["kosovo", "kosovar"]],
  ["LB", ["libano", "libanes", "libanesa"]],
  ["LT", ["lituania", "lituano", "lituana"]],
  ["LU", ["luxemburgo", "luxemburgues", "luxemburguesa"]],
  ["MY", ["malasia", "malasio", "malasia"]],
  ["ML", ["mali", "maliense", "malies"]],
  ["MT", ["malta", "maltes", "maltesa"]],
  ["MR", ["mauritania", "mauritano", "mauritana"]],
  ["MX", ["mexico", "mejico", "mexicano", "mexicana"]],
  ["MD", ["moldavia", "moldavo", "moldava"]],
  ["MA", ["marruecos", "marroqui", "maroc", "morocco"]],
  ["MZ", ["mozambique", "mozambiqueno", "mozambiquena"]],
  ["NP", ["nepal", "nepali", "nepales"]],
  ["NL", ["paises bajos", "holanda", "holandes", "holandesa", "neerlandes", "neerlandesa", "netherlands", "dutch"]],
  ["NZ", ["nueva zelanda", "neozelandes", "neozelandesa"]],
  ["NI", ["nicaragua", "nicaraguense"]],
  ["NE", ["niger", "nigerino", "nigerina"]],
  ["NG", ["nigeria", "nigeriano", "nigeriana"]],
  ["NO", ["noruega", "noruego"]],
  ["PK", ["pakistan", "paquistan", "pakistani", "paquistani"]],
  ["PA", ["panama", "panameno", "panamena"]],
  ["PY", ["paraguay", "paraguayo", "paraguaya"]],
  ["PE", ["peru", "peruano", "peruana"]],
  ["PL", ["polonia", "polaco", "polaca", "poland"]],
  ["PT", ["portugal", "portugues", "portuguesa"]],
  ["GB", ["reino unido", "britanico", "britanica", "ingles", "inglesa", "united kingdom", "uk", "england", "british", "escoces", "escocesa", "gran bretana"]],
  ["RO", ["rumania", "rumano", "rumana", "romania"]],
  ["RU", ["rusia", "ruso", "rusa", "russia"]],
  ["SN", ["senegal", "senegales", "senegalesa"]],
  ["RS", ["serbia", "serbio", "serbia"]],
  ["SL", ["sierra leona", "sierraleones", "sierraleonesa"]],
  ["SK", ["eslovaquia", "eslovaco", "eslovaca"]],
  ["SI", ["eslovenia", "esloveno", "eslovena"]],
  ["SO", ["somalia", "somali"]],
  ["ZA", ["sudafrica", "sudafricano", "sudafricana"]],
  ["SE", ["suecia", "sueco", "sueca", "sweden"]],
  ["CH", ["suiza", "suizo", "switzerland", "swiss"]],
  ["SY", ["siria", "sirio"]],
  ["TH", ["tailandia", "tailandes", "tailandesa"]],
  ["TN", ["tunez", "tunecino", "tunecina", "tunisie"]],
  ["TR", ["turquia", "turco", "turca", "turkey"]],
  ["UA", ["ucrania", "ucraniano", "ucraniana", "ukraine"]],
  ["US", ["estados unidos", "estadounidense", "eeuu", "ee.uu.", "ee. uu.", "usa", "united states", "american", "americano", "americana", "norteamericano", "norteamericana"]],
  ["UY", ["uruguay", "uruguayo", "uruguaya"]],
  ["UZ", ["uzbekistan", "uzbeko", "uzbeka"]],
  ["VE", ["venezuela", "venezolano", "venezolana"]],
  ["VN", ["vietnam", "vietnamita"]],
];

const normaliza = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z' .-]+/g, " ").replace(/\s+/g, " ").trim();

const INDICE = new Map<string, string>();
for (const [iso, nombres] of PAISES) for (const n of nombres) INDICE.set(normaliza(n), iso);

// `nacionalidad` libre → ISO-2, o null si no se reconoce. Acepta ya un código ISO («CO»).
export function paisIsoDeNacionalidad(nacionalidad: string | null | undefined): string | null {
  const bruto = String(nacionalidad ?? "").trim();
  if (!bruto) return null;
  if (/^[A-Za-z]{2}$/.test(bruto) && PAISES.some(([iso]) => iso === bruto.toUpperCase())) return bruto.toUpperCase();
  const n = normaliza(bruto);
  if (INDICE.has(n)) return INDICE.get(n)!;
  // «nacionalidad colombiana», «de colombia», «Colombia / Venezuela» → primer país reconocido.
  const sinRelleno = n.replace(/\b(nacionalidad|de|del|la|el|origen)\b/g, " ").replace(/\s+/g, " ").trim();
  if (INDICE.has(sinRelleno)) return INDICE.get(sinRelleno)!;
  // Varios países separados por / , ; → el primero reconocido (se parte ANTES de normalizar).
  for (const trozo of bruto.split(/[\/,;()]+/).map((t) => normaliza(t)).filter(Boolean)) {
    if (INDICE.has(trozo)) return INDICE.get(trozo)!;
  }
  return null;
}
