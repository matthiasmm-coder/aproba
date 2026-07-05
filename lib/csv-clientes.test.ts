import { describe, it, expect } from "vitest";
import { parseClientesCsv, filaACliente, llavesDeClientes, PLANTILLA_CSV, CABECERAS } from "@/lib/csv-clientes";
import { FICHA_KEYS } from "@/lib/ficha";

const CSV_COMPLETO =
  "nombre;apellidos;email;telefono;nacionalidad;documento;sexo;fechaNacimiento;estadoCivil;via;numero;codigoPostal;municipio;provincia;idioma\n" +
  "Julia;Mendoza;julia@email.com;600111;Colombia;X1A;M;1990-05-12;C;Calle Mayor;23;28013;Madrid;Madrid;es\n" +
  "Liu;Wei;liu@email.com;600222;China;X2B;H;1985-01-02;S;Av Real;5;08001;Barcelona;Barcelona;ca\n";

describe("parseClientesCsv — ficha completa", () => {
  it("captura TODOS los campos de la ficha (no solo los 7 básicos)", () => {
    const filas = parseClientesCsv(CSV_COMPLETO);
    expect(filas).toHaveLength(2);
    const f = filas[0];
    expect(f.estado).toBe("ok");
    expect(f.nombre).toBe("Julia");
    expect(f.apellidos).toBe("Mendoza");
    expect(f.sexo).toBe("M");
    expect(f.fechaNacimiento).toBe("1990-05-12");
    expect(f.estadoCivil).toBe("C");
    expect(f.via).toBe("Calle Mayor");
    expect(f.numeroVia).toBe("23");
    expect(f.codigoPostal).toBe("28013");
    expect(f.municipio).toBe("Madrid");
    expect(f.provincia).toBe("Madrid");
    expect(f.nacionalidad).toBe("Colombia");
    expect(f.numeroDocumento).toBe("X1A");
    expect(f.idioma).toBe("es");
  });

  it("filaACliente escribe una columna por cada clave de la ficha (mismas que el portal)", () => {
    const [f] = parseClientesCsv(CSV_COMPLETO);
    const row = filaACliente(f, "ws_test");
    for (const k of FICHA_KEYS) expect(k in row).toBe(true);
    expect(row.workspaceId).toBe("ws_test");
    expect(row.nombre).toBe("Julia");
    expect(row.sexo).toBe("M");
    expect(row.fechaNacimiento).toBe("1990-05-12");
    expect(row.codigoPostal).toBe("28013");
    // campos no presentes en CSV → null (no "")
    expect(row.lugarNacimiento).toBeNull();
    expect(row.nombrePadre).toBeNull();
  });

  it("marca duplicados frente a clientes existentes y dentro del propio fichero", () => {
    const llaves = llavesDeClientes([{ nombre: "Julia", apellidos: "Mendoza", email: "julia@email.com" }]);
    const filas = parseClientesCsv(CSV_COMPLETO, llaves);
    expect(filas[0].estado).toBe("duplicado"); // ya existe
    expect(filas[1].estado).toBe("ok");
  });

  it("marca filas sin nombre y tolera cabeceras en/fr (surname, prenom, address)", () => {
    const csv = "prenom;surname;mail;address\nMaria;Lopez;m@e.com;Gran Via\n;Solo Apellido;x@e.com;Calle\n";
    const filas = parseClientesCsv(csv);
    expect(filas[0].nombre).toBe("Maria");
    expect(filas[0].apellidos).toBe("Lopez");
    expect(filas[0].via).toBe("Gran Via");
    expect(filas[1].estado).toBe("sin_nombre");
  });

  it("lanza si falta la columna nombre", () => {
    expect(() => parseClientesCsv("apellidos;email\nLopez;m@e.com\n")).toThrow();
  });

  it("la plantilla cubre la ficha y CABECERAS incluye los campos avanzados", () => {
    expect(PLANTILLA_CSV).toContain("sexo");
    expect(PLANTILLA_CSV).toContain("fechaNacimiento");
    expect(PLANTILLA_CSV).toContain("estadoCivil");
    for (const k of ["sexo", "fechaNacimiento", "estadoCivil", "via", "codigoPostal", "municipio", "provincia"] as const) {
      expect(CABECERAS[k]).toBeTruthy();
    }
  });
});

// ── Vigía: columna caducidadTIE → siembra el radar de vencimientos al importar ──
import { normalizarFechaCsv } from "@/lib/csv-clientes";

describe("caducidadTIE (Vigía)", () => {
  it("normalizarFechaCsv acepta dd/mm/aaaa, dd-mm-aaaa e ISO; rechaza lo demás", () => {
    expect(normalizarFechaCsv("15/07/2027")).toBe("2027-07-15");
    expect(normalizarFechaCsv("1/3/2027")).toBe("2027-03-01");
    expect(normalizarFechaCsv("15-07-2027")).toBe("2027-07-15");
    expect(normalizarFechaCsv("2027-07-15")).toBe("2027-07-15");
    expect(normalizarFechaCsv("")).toBe("");
    expect(normalizarFechaCsv("pronto")).toBe("");
    expect(normalizarFechaCsv("31/02/2027")).toBe(""); // fecha imposible
  });

  it("captura la columna con sus alias y la normaliza a ISO", () => {
    const csv =
      "nombre;caducidad TIE\n" +
      "Karim;15/07/2027\n" +
      "Fatou;2026-12-01\n" +
      "Ana;\n";
    const filas = parseClientesCsv(csv);
    expect(filas[0].fechaCaducidad).toBe("2027-07-15");
    expect(filas[1].fechaCaducidad).toBe("2026-12-01");
    expect(filas[2].fechaCaducidad).toBe("");
  });

  it("filaACliente escribe fechaCaducidad + tipoVencimiento solo si hay fecha", () => {
    const filas = parseClientesCsv("nombre;caducidadtie\nKarim;15/07/2027\nAna;\n");
    const con = filaACliente(filas[0], "ws1");
    const sin = filaACliente(filas[1], "ws1");
    expect(con.fechaCaducidad).toBe("2027-07-15");
    expect(con.tipoVencimiento).toBe("TIE");
    expect("fechaCaducidad" in sin).toBe(false);
  });

  it("la plantilla incluye la columna caducidadTIE", () => {
    expect(PLANTILLA_CSV).toContain("caducidadTIE");
  });
});
