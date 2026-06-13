import type { Expediente, ExpedienteEstado } from "./types";

// ── 6 expedientes détaillés (avec documents + extraction IA, pour la page détail) ──
const DETALLADOS: Expediente[] = [
  {
    id: "exp-0042",
    referencia: "EXP-2026-0042",
    tipoLabel: "Arraigo social",
    estado: "DOCS_VALIDADOS",
    clienteNombre: "Julia Mendoza",
    clienteNacionalidad: "Colombia",
    asignadoA: "Marta R.",
    creado: "02/06/2026",
    fechaLimite: "28/06/2026",
    documentos: [
      { id: "d1", tipoLabel: "Pasaporte", estado: "VALIDADO", extraction: { tipoDetectado: "pasaporte", confianzaGlobal: 0.97, legibilidad: "legible", alertas: [], campos: [{ label: "Nombre", value: "Julia" }, { label: "Apellidos", value: "Mendoza Restrepo" }, { label: "Nº pasaporte", value: "AV284917" }, { label: "Nacionalidad", value: "Colombiana" }, { label: "F. nacimiento", value: "1991-03-14" }, { label: "F. caducidad", value: "2029-08-22" }] } },
      { id: "d2", tipoLabel: "Empadronamiento", estado: "VALIDADO", extraction: { tipoDetectado: "empadronamiento", confianzaGlobal: 0.93, legibilidad: "legible", alertas: [], campos: [{ label: "Nombre completo", value: "Julia Mendoza Restrepo" }, { label: "Dirección", value: "C/ Sepúlveda 112, 3º 2ª" }, { label: "Municipio", value: "Barcelona" }, { label: "F. emisión", value: "2026-05-18" }] } },
      { id: "d3", tipoLabel: "Contrato de trabajo", estado: "VALIDADO", extraction: { tipoDetectado: "contrato_trabajo", confianzaGlobal: 0.89, legibilidad: "legible", alertas: [], campos: [{ label: "Empleador", value: "Restauración Bonavista SL" }, { label: "Puesto", value: "Ayudante de cocina" }, { label: "Tipo contrato", value: "Indefinido · jornada completa" }, { label: "Salario bruto/año", value: "18 000 €" }, { label: "F. inicio", value: "2026-07-01" }] } },
      { id: "d4", tipoLabel: "Antecedentes penales", estado: "VALIDADO", extraction: { tipoDetectado: "antecedentes_penales", confianzaGlobal: 0.91, legibilidad: "legible", alertas: [], campos: [{ label: "Nombre completo", value: "Julia Mendoza Restrepo" }, { label: "País", value: "Colombia" }, { label: "Resultado", value: "Sin antecedentes" }, { label: "F. emisión", value: "2026-04-30" }] } },
    ],
    formularios: [{ id: "f1", tipo: "EX-10" }, { id: "f2", tipo: "790-012" }],
    eventos: [
      { fecha: "02/06", titulo: "Expediente creado", autor: "Marta R." },
      { fecha: "04/06", titulo: "Pasaporte subido y validado por IA" },
      { fecha: "07/06", titulo: "Empadronamiento validado" },
      { fecha: "09/06", titulo: "Contrato y antecedentes validados" },
      { fecha: "10/06", titulo: "Listo para generar formularios", autor: "Marta R." },
    ],
  },
  {
    id: "exp-0039",
    referencia: "EXP-2026-0039",
    tipoLabel: "Renovación TIE",
    estado: "DOCS_PENDIENTES",
    clienteNombre: "Karim Benali",
    clienteNacionalidad: "Marruecos",
    asignadoA: "Marta R.",
    creado: "30/05/2026",
    fechaLimite: "20/06/2026",
    documentos: [
      { id: "d5", tipoLabel: "TIE actual", estado: "VALIDADO", extraction: { tipoDetectado: "tarjeta_residencia_tie", confianzaGlobal: 0.72, legibilidad: "parcial", alertas: ["Foto recortada, falta un borde"], campos: [{ label: "Nombre", value: "Karim" }, { label: "Apellidos", value: "Benali" }, { label: "NIE", value: "Y3948172X" }, { label: "F. caducidad", value: "2026-07-15" }] } },
      { id: "d6", tipoLabel: "Empadronamiento", estado: "PROCESANDO" },
      { id: "d7", tipoLabel: "Justificante de medios", estado: "PENDIENTE" },
    ],
    formularios: [],
    eventos: [
      { fecha: "30/05", titulo: "Expediente creado", autor: "Marta R." },
      { fecha: "01/06", titulo: "TIE actual subida — revisar foto recortada" },
    ],
  },
  {
    id: "exp-0044",
    referencia: "EXP-2026-0044",
    tipoLabel: "Reagrupación familiar",
    estado: "FORM_GENERADO",
    clienteNombre: "Liu Wei",
    clienteNacionalidad: "China",
    asignadoA: "Diego F.",
    creado: "28/05/2026",
    fechaLimite: "13/06/2026",
    documentos: [],
    formularios: [{ id: "f3", tipo: "EX-02" }, { id: "f4", tipo: "790-012" }],
    eventos: [
      { fecha: "28/05", titulo: "Expediente creado", autor: "Diego F." },
      { fecha: "05/06", titulo: "Documentos validados (5/5)" },
      { fecha: "06/06", titulo: "Formularios EX-02 + 790-012 generados" },
    ],
  },
  {
    id: "exp-0036",
    referencia: "EXP-2026-0036",
    tipoLabel: "Arraigo laboral",
    estado: "PRESENTADO",
    clienteNombre: "Aïcha Diallo",
    clienteNacionalidad: "Senegal",
    asignadoA: "Diego F.",
    creado: "20/05/2026",
    documentos: [],
    formularios: [{ id: "f5", tipo: "EX-10" }],
    eventos: [
      { fecha: "20/05", titulo: "Expediente creado" },
      { fecha: "03/06", titulo: "Presentado en sede electrónica" },
    ],
  },
  {
    id: "exp-0031",
    referencia: "EXP-2026-0031",
    tipoLabel: "Nacionalidad",
    estado: "RESUELTO",
    clienteNombre: "Oksana Koval",
    clienteNacionalidad: "Ucrania",
    asignadoA: "Marta R.",
    creado: "12/05/2026",
    documentos: [],
    formularios: [],
    eventos: [
      { fecha: "12/05", titulo: "Expediente creado" },
      { fecha: "08/06", titulo: "Resolución favorable" },
    ],
  },
  {
    id: "exp-0045",
    referencia: "EXP-2026-0045",
    tipoLabel: "NIE",
    estado: "DOCS_PENDIENTES",
    clienteNombre: "Samuel Okafor",
    clienteNacionalidad: "Nigeria",
    asignadoA: "Marta R.",
    creado: "08/06/2026",
    documentos: [{ id: "d8", tipoLabel: "Pasaporte", estado: "PROCESANDO" }],
    formularios: [],
    eventos: [{ fecha: "08/06", titulo: "Expediente creado", autor: "Marta R." }],
  },
];

// ── Génération de ~44 expedientes pour simuler une gestoría à fort volume (50+) ──
const PERSONAS: [string, string, string][] = [
  ["Fatima", "El Amrani", "Marruecos"], ["Wassim", "Haddad", "Argelia"], ["Andrés", "Patiño", "Colombia"], ["Yuliana", "Rojas", "Venezuela"],
  ["Mohammed", "Khan", "Pakistán"], ["Lin", "Zhang", "China"], ["Ousmane", "Ba", "Senegal"], ["Ioana", "Popescu", "Rumanía"],
  ["Carlos", "Mendoza", "Honduras"], ["Svitlana", "Bondar", "Ucrania"], ["Diego", "Quispe", "Bolivia"], ["Rosa", "Chávez", "Perú"],
  ["Ahmed", "Benali", "Marruecos"], ["María", "Fernández", "Argentina"], ["Nguyen", "Tran", "Vietnam"], ["Aisha", "Camara", "Guinea"],
  ["Pedro", "Sousa", "Brasil"], ["Olena", "Tkachenko", "Ucrania"], ["Yassine", "Idrissi", "Marruecos"], ["Camila", "Restrepo", "Colombia"],
  ["Bilal", "Aslam", "Pakistán"], ["Wei", "Chen", "China"], ["Mariana", "Duarte", "Venezuela"], ["Samuel", "Mensah", "Ghana"],
  ["Elena", "Ionescu", "Rumanía"], ["Hassan", "Tahiri", "Marruecos"], ["Lucía", "Morales", "Ecuador"], ["Dmytro", "Kovalenko", "Ucrania"],
  ["Fatou", "Diop", "Senegal"], ["Javier", "Núñez", "Cuba"], ["Aicha", "Belkacem", "Argelia"], ["Ravi", "Sharma", "India"],
  ["Gabriela", "Castro", "Honduras"], ["Karim", "Saidi", "Marruecos"], ["Valentina", "Gómez", "Colombia"], ["Sok", "Chan", "Camboya"],
  ["Natalia", "Melnyk", "Ucrania"], ["Omar", "Farouk", "Egipto"], ["Daniela", "Vega", "Chile"], ["Tariq", "Mahmood", "Pakistán"],
  ["Mei", "Wang", "China"], ["Joseph", "Okonkwo", "Nigeria"], ["Sofía", "Ramírez", "Bolivia"], ["Reza", "Ahmadi", "Irán"],
];

const TIPOS = ["Arraigo social", "Renovación TIE", "Reagrupación familiar", "Nacionalidad", "Arraigo laboral", "Residencia larga duración", "NIE"];
const GESTORES = ["Marta R.", "Diego F.", "Nuria C."];
const ESTADO_SEQ: ExpedienteEstado[] = ["DOCS_PENDIENTES", "PRESENTADO", "RESUELTO", "DOCS_VALIDADOS", "DOCS_PENDIENTES", "PRESENTADO", "FORM_GENERADO", "RESUELTO", "DOCS_PENDIENTES", "PRESENTADO", "DOCS_VALIDADOS"];
const FECHAS = ["05/06", "08/06", "10/06", "12/06", "13/06", "15/06", "17/06", "19/06", "23/06", "27/06", "01/07", "04/07"];

const GENERADOS: Expediente[] = PERSONAS.map((p, i) => {
  const estado = ESTADO_SEQ[i % ESTADO_SEQ.length];
  const accion = estado === "DOCS_VALIDADOS" || estado === "FORM_GENERADO";
  const conLimite = accion || i % 3 === 0;
  return {
    id: `exp-2${String(i).padStart(3, "0")}`,
    referencia: `EXP-2026-0${101 + i}`,
    tipoLabel: TIPOS[i % TIPOS.length],
    estado,
    clienteNombre: `${p[0]} ${p[1]}`,
    clienteNacionalidad: p[2],
    asignadoA: GESTORES[i % GESTORES.length],
    creado: `${String((i % 27) + 1).padStart(2, "0")}/06/2026`,
    fechaLimite: conLimite ? FECHAS[i % FECHAS.length] : undefined,
    documentos: [],
    formularios: estado === "FORM_GENERADO" ? [{ id: `gf${i}`, tipo: "EX-10" }] : [],
    eventos: [{ fecha: `${String((i % 9) + 2).padStart(2, "0")}/06`, titulo: "Expediente creado", autor: GESTORES[i % GESTORES.length] }],
  };
});

export const EXPEDIENTES: Expediente[] = [...DETALLADOS, ...GENERADOS];

export function getExpediente(id: string): Expediente | undefined {
  return EXPEDIENTES.find((e) => e.id === id);
}

export const WORKSPACE = {
  nombre: "Gestoría Vallès",
  tipo: "Gestoría",
  usuario: { nombre: "Marta Ribas", email: "marta@gestoriavalles.es", iniciales: "MR" },
  plan: "Pro",
};
