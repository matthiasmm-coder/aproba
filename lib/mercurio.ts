import type { ClienteFicha } from "./ficha";

// Mapping de la "ficha del solicitante" hacia los campos de la plataforma MERCURIO
// (presentación telemática de extranjería), en el orden de sus pestañas. No hay API:
// el asistente solo ordena los datos para que el gestor los copie/pegue. Las etiquetas
// se mantienen en castellano porque reflejan las casillas reales de Mercurio.

export type MercurioCampo = {
  label: string;
  value: string;
  /** true = en Mercurio es un desplegable/selección: hay que elegir, no pegar. */
  seleccion?: boolean;
};
export type MercurioGrupo = { titulo: string; campos: MercurioCampo[] };

const SEXO: Record<string, string> = { H: "Hombre", M: "Mujer", X: "No especificado" };
const ECIVIL: Record<string, string> = { S: "Soltero/a", C: "Casado/a", V: "Viudo/a", D: "Divorciado/a", Sp: "Separado/a" };

function fechaEs(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso.trim();
}

const v = (s?: string) => (s ?? "").trim();

export function camposMercurio(f: ClienteFicha): MercurioGrupo[] {
  const ap = v(f.apellidos).split(/\s+/).filter(Boolean);
  const primerApellido = ap[0] ?? "";
  const segundoApellido = ap.slice(1).join(" ");

  return [
    {
      titulo: "Datos del extranjero",
      campos: [
        { label: "Nº de documento (NIE / Pasaporte)", value: v(f.numeroDocumento || f.pasaporte) },
        { label: "Primer apellido", value: primerApellido },
        { label: "Segundo apellido", value: segundoApellido },
        { label: "Nombre", value: v(f.nombre) },
        { label: "Fecha de nacimiento", value: fechaEs(f.fechaNacimiento) },
        { label: "Sexo", value: f.sexo ? (SEXO[f.sexo] ?? f.sexo) : "", seleccion: true },
        { label: "Lugar de nacimiento", value: v(f.lugarNacimiento) },
        { label: "País de nacimiento", value: v(f.paisNacimiento), seleccion: true },
        { label: "Nacionalidad", value: v(f.nacionalidad), seleccion: true },
        { label: "Estado civil", value: f.estadoCivil ? (ECIVIL[f.estadoCivil] ?? f.estadoCivil) : "", seleccion: true },
        { label: "Nombre del padre", value: v(f.nombrePadre) },
        { label: "Nombre de la madre", value: v(f.nombreMadre) },
      ],
    },
    {
      titulo: "Domicilio en España",
      campos: [
        { label: "Domicilio (vía)", value: v(f.via) },
        { label: "Número", value: v(f.numeroVia) },
        { label: "Piso / puerta", value: v(f.piso) },
        { label: "Código postal", value: v(f.codigoPostal) },
        { label: "Municipio", value: v(f.municipio) },
        { label: "Provincia", value: v(f.provincia), seleccion: true },
      ],
    },
    {
      titulo: "Contacto",
      campos: [
        { label: "Teléfono", value: v(f.telefono) },
        { label: "Correo electrónico", value: v(f.email) },
      ],
    },
  ];
}

/** Lista plana de campos (para enviar a la extensión que rellena Mercurio). */
export function camposMercurioFlat(f: ClienteFicha): MercurioCampo[] {
  return camposMercurio(f).flatMap((g) => g.campos);
}
