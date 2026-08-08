// Prefijos telefónicos internacionales para los campos de teléfono (gestor y cliente).
// Orden deliberado: España primero, luego las nacionalidades más frecuentes en
// extranjería española (los clientes reales del despacho), y después el resto por
// continente. Así el gestor y el migrante encuentran el suyo sin recorrer 200 países.

export type Prefijo = { code: string; dial: string; nombre: string; flag: string };

export const PREFIJOS: Prefijo[] = [
  { code: "ES", dial: "+34", nombre: "España", flag: "🇪🇸" },
  // Principales nacionalidades de extranjería en España
  { code: "MA", dial: "+212", nombre: "Marruecos", flag: "🇲🇦" },
  { code: "CO", dial: "+57", nombre: "Colombia", flag: "🇨🇴" },
  { code: "VE", dial: "+58", nombre: "Venezuela", flag: "🇻🇪" },
  { code: "PE", dial: "+51", nombre: "Perú", flag: "🇵🇪" },
  { code: "EC", dial: "+593", nombre: "Ecuador", flag: "🇪🇨" },
  { code: "AR", dial: "+54", nombre: "Argentina", flag: "🇦🇷" },
  { code: "BO", dial: "+591", nombre: "Bolivia", flag: "🇧🇴" },
  { code: "HN", dial: "+504", nombre: "Honduras", flag: "🇭🇳" },
  { code: "DO", dial: "+1", nombre: "República Dominicana", flag: "🇩🇴" },
  { code: "CU", dial: "+53", nombre: "Cuba", flag: "🇨🇺" },
  { code: "PY", dial: "+595", nombre: "Paraguay", flag: "🇵🇾" },
  { code: "NI", dial: "+505", nombre: "Nicaragua", flag: "🇳🇮" },
  { code: "SV", dial: "+503", nombre: "El Salvador", flag: "🇸🇻" },
  { code: "GT", dial: "+502", nombre: "Guatemala", flag: "🇬🇹" },
  { code: "BR", dial: "+55", nombre: "Brasil", flag: "🇧🇷" },
  { code: "CL", dial: "+56", nombre: "Chile", flag: "🇨🇱" },
  { code: "UY", dial: "+598", nombre: "Uruguay", flag: "🇺🇾" },
  { code: "MX", dial: "+52", nombre: "México", flag: "🇲🇽" },
  { code: "RO", dial: "+40", nombre: "Rumanía", flag: "🇷🇴" },
  { code: "UA", dial: "+380", nombre: "Ucrania", flag: "🇺🇦" },
  { code: "BG", dial: "+359", nombre: "Bulgaria", flag: "🇧🇬" },
  { code: "RU", dial: "+7", nombre: "Rusia", flag: "🇷🇺" },
  { code: "CN", dial: "+86", nombre: "China", flag: "🇨🇳" },
  { code: "PK", dial: "+92", nombre: "Pakistán", flag: "🇵🇰" },
  { code: "IN", dial: "+91", nombre: "India", flag: "🇮🇳" },
  { code: "BD", dial: "+880", nombre: "Bangladés", flag: "🇧🇩" },
  { code: "NP", dial: "+977", nombre: "Nepal", flag: "🇳🇵" },
  { code: "PH", dial: "+63", nombre: "Filipinas", flag: "🇵🇭" },
  { code: "SN", dial: "+221", nombre: "Senegal", flag: "🇸🇳" },
  { code: "NG", dial: "+234", nombre: "Nigeria", flag: "🇳🇬" },
  { code: "ML", dial: "+223", nombre: "Malí", flag: "🇲🇱" },
  { code: "GM", dial: "+220", nombre: "Gambia", flag: "🇬🇲" },
  { code: "GN", dial: "+224", nombre: "Guinea", flag: "🇬🇳" },
  { code: "CI", dial: "+225", nombre: "Costa de Marfil", flag: "🇨🇮" },
  { code: "GH", dial: "+233", nombre: "Ghana", flag: "🇬🇭" },
  { code: "CM", dial: "+237", nombre: "Camerún", flag: "🇨🇲" },
  { code: "DZ", dial: "+213", nombre: "Argelia", flag: "🇩🇿" },
  { code: "TN", dial: "+216", nombre: "Túnez", flag: "🇹🇳" },
  { code: "EG", dial: "+20", nombre: "Egipto", flag: "🇪🇬" },
  { code: "MR", dial: "+222", nombre: "Mauritania", flag: "🇲🇷" },
  { code: "GQ", dial: "+240", nombre: "Guinea Ecuatorial", flag: "🇬🇶" },
  { code: "MA_EH", dial: "+212", nombre: "Sáhara Occidental", flag: "🏳️" },
  // Europa
  { code: "PT", dial: "+351", nombre: "Portugal", flag: "🇵🇹" },
  { code: "FR", dial: "+33", nombre: "Francia", flag: "🇫🇷" },
  { code: "IT", dial: "+39", nombre: "Italia", flag: "🇮🇹" },
  { code: "DE", dial: "+49", nombre: "Alemania", flag: "🇩🇪" },
  { code: "GB", dial: "+44", nombre: "Reino Unido", flag: "🇬🇧" },
  { code: "IE", dial: "+353", nombre: "Irlanda", flag: "🇮🇪" },
  { code: "NL", dial: "+31", nombre: "Países Bajos", flag: "🇳🇱" },
  { code: "BE", dial: "+32", nombre: "Bélgica", flag: "🇧🇪" },
  { code: "CH", dial: "+41", nombre: "Suiza", flag: "🇨🇭" },
  { code: "AT", dial: "+43", nombre: "Austria", flag: "🇦🇹" },
  { code: "PL", dial: "+48", nombre: "Polonia", flag: "🇵🇱" },
  { code: "SE", dial: "+46", nombre: "Suecia", flag: "🇸🇪" },
  { code: "NO", dial: "+47", nombre: "Noruega", flag: "🇳🇴" },
  { code: "DK", dial: "+45", nombre: "Dinamarca", flag: "🇩🇰" },
  { code: "FI", dial: "+358", nombre: "Finlandia", flag: "🇫🇮" },
  { code: "GR", dial: "+30", nombre: "Grecia", flag: "🇬🇷" },
  { code: "CZ", dial: "+420", nombre: "Chequia", flag: "🇨🇿" },
  { code: "HU", dial: "+36", nombre: "Hungría", flag: "🇭🇺" },
  { code: "RS", dial: "+381", nombre: "Serbia", flag: "🇷🇸" },
  { code: "AL", dial: "+355", nombre: "Albania", flag: "🇦🇱" },
  { code: "MD", dial: "+373", nombre: "Moldavia", flag: "🇲🇩" },
  { code: "GE", dial: "+995", nombre: "Georgia", flag: "🇬🇪" },
  { code: "TR", dial: "+90", nombre: "Turquía", flag: "🇹🇷" },
  // América del Norte y otros
  { code: "US", dial: "+1", nombre: "Estados Unidos", flag: "🇺🇸" },
  { code: "CA", dial: "+1", nombre: "Canadá", flag: "🇨🇦" },
  { code: "CR", dial: "+506", nombre: "Costa Rica", flag: "🇨🇷" },
  { code: "PA", dial: "+507", nombre: "Panamá", flag: "🇵🇦" },
  // Oriente Medio y Asia
  { code: "MA_SY", dial: "+963", nombre: "Siria", flag: "🇸🇾" },
  { code: "IQ", dial: "+964", nombre: "Irak", flag: "🇮🇶" },
  { code: "IR", dial: "+98", nombre: "Irán", flag: "🇮🇷" },
  { code: "LB", dial: "+961", nombre: "Líbano", flag: "🇱🇧" },
  { code: "PS", dial: "+970", nombre: "Palestina", flag: "🇵🇸" },
  { code: "IL", dial: "+972", nombre: "Israel", flag: "🇮🇱" },
  { code: "SA", dial: "+966", nombre: "Arabia Saudí", flag: "🇸🇦" },
  { code: "AE", dial: "+971", nombre: "Emiratos Árabes Unidos", flag: "🇦🇪" },
  { code: "JP", dial: "+81", nombre: "Japón", flag: "🇯🇵" },
  { code: "KR", dial: "+82", nombre: "Corea del Sur", flag: "🇰🇷" },
  { code: "TH", dial: "+66", nombre: "Tailandia", flag: "🇹🇭" },
  { code: "VN", dial: "+84", nombre: "Vietnam", flag: "🇻🇳" },
  { code: "ID", dial: "+62", nombre: "Indonesia", flag: "🇮🇩" },
  { code: "AU", dial: "+61", nombre: "Australia", flag: "🇦🇺" },
];

export const PREFIJO_POR_DEFECTO = "+34";

// Prefijos ordenados de más largo a más corto: al detectar, «+34» no debe ganarle a
// «+340» ni «+1» a «+1»… (el más específico primero).
const DIALES_ORDENADOS = [...new Set(PREFIJOS.map((p) => p.dial))].sort((a, b) => b.length - a.length);

// Separa un teléfono guardado en (prefijo, resto). Si no lleva prefijo internacional
// reconocible, prefijo = "" y el número se devuelve tal cual — NUNCA se inventa un país
// para un dato ya existente (un «612345678» sin prefijo se queda como está hasta que el
// usuario lo edite).
export function separarTelefono(valor: string | null | undefined): { dial: string; numero: string } {
  const v = (valor ?? "").trim();
  if (!v.startsWith("+")) return { dial: "", numero: v };
  // Normalizar espacios/guiones solo para COMPARAR el prefijo.
  const compacto = v.replace(/[\s.\-()]/g, "");
  const dial = DIALES_ORDENADOS.find((d) => compacto.startsWith(d));
  if (!dial) return { dial: "", numero: v };
  return { dial, numero: compacto.slice(dial.length).trim() };
}

// Une prefijo + número en el valor que se guarda. Sin número → cadena vacía (no se
// guarda un teléfono que sea solo un prefijo).
export function unirTelefono(dial: string, numero: string): string {
  const n = (numero ?? "").trim();
  if (!n) return "";
  if (!dial) return n;
  return `${dial} ${n}`;
}
