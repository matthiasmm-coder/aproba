import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { CODIGO_CANJE_DGT, partirPiso, partirVia, provinciaDgt, rellenarMod03, rellenarMod24, telefonoDgt } from "@/lib/dgt-forms";
import { CANJE_VACIO } from "@/lib/canje";
import type { DatosForm } from "@/lib/formularios";

// Impresos oficiales de la DGT para el canje (forms/dgt/, 03/10/2026). Datos ficticios.
const FECHA = new Date("2026-10-03T10:00:00Z");
const DATOS: DatosForm = {
  pasaporte: "PE1234567", nie1: "Y", nie2: "1234567", nie3: "Z",
  apellido1: "Ríos", apellido2: "Quispe", nombre: "Valentina", sexo: "M", estadoCivil: "S",
  fechaD: "14", fechaM: "02", fechaA: "1991", lugarNac: "Lima", paisNac: "Perú", nacionalidad: "Peruana",
  nombrePadre: "", nombreMadre: "", domicilio: "Calle Mayor", numero: "12", piso: "3º 2ª",
  localidad: "Madrid", cp: "28013", provincia: "Madrid", telefono: "+34 600 000 000", email: "valentina@example.com",
};
const leer = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getForm();

describe("impresos de la DGT · datos", () => {
  it("provincia del impreso: por el código postal y, sin él, por el nombre", () => {
    expect(provinciaDgt("08001", "")).toBe("Barcelona");
    expect(provinciaDgt("15001", "")).toBe("Coruña, A");
    expect(provinciaDgt("46015", "Valencia")).toBe("Valencia/València");
    expect(provinciaDgt("", "A Coruña")).toBe("Coruña, A");
    expect(provinciaDgt("", "Islas Baleares")).toBe("Balears, Illes");
    expect(provinciaDgt("", "las palmas")).toBe("Palmas, Las");
    expect(provinciaDgt("", "Alacant")).toBe("Alicante/Alacant");
    expect(provinciaDgt("", "Ávila")).toBe("Ávila");
    expect(provinciaDgt("", "Narnia")).toBeNull();
  });

  it("vía y piso partidos como los pide el impreso", () => {
    expect(partirVia("Calle Mayor")).toEqual({ tipo: "Calle", nombre: "Mayor" });
    expect(partirVia("C/ Velázquez")).toEqual({ tipo: "Calle", nombre: "Velázquez" });
    expect(partirVia("Avda. de América")).toEqual({ tipo: "Avda.", nombre: "de América" });
    expect(partirVia("Gran Via de les Corts Catalanes")).toEqual({ tipo: "", nombre: "Gran Via de les Corts Catalanes" });
    expect(partirPiso("3º 2ª")).toEqual({ planta: "3º", puerta: "2ª" });
    expect(partirPiso("1-B")).toEqual({ planta: "1", puerta: "B" });
    expect(partirPiso("Bajo")).toEqual({ planta: "Bajo", puerta: "" });
  });

  it("teléfono en las 9 cifras que admite el impreso", () => {
    expect(telefonoDgt("+34 611 205 874")).toBe("611205874");
    expect(telefonoDgt("+34611205874")).toBe("611205874");
    expect(telefonoDgt("0034 611-20-58-74")).toBe("611205874");
    expect(telefonoDgt("34611205874")).toBe("611205874");
    expect(telefonoDgt("912 345 678")).toBe("912345678");
    expect(telefonoDgt("+57 300 123 4567")).toBe("");
    expect(telefonoDgt("12345")).toBe("");
    expect(telefonoDgt(null)).toBe("");
  });
});

describe("impresos de la DGT · PDF", () => {
  it("Mod. 03: canje de otro país, permiso en la fila del canje, domicilio del titular, lugar y fecha", async () => {
    const canje = { ...CANJE_VACIO, pais: "Perú", numero: "Q12345678", clases: ["A", "B"], expedicion: "2018-05-10", caducidad: "2028-05-10" };
    const f = await leer(await rellenarMod03({ datos: DATOS, canje, lugar: "Madrid", fecha: FECHA }));
    const txt = (n: string) => f.getTextField(n).getText() ?? "";
    expect(f.getRadioGroup("tramite").getSelected()).toBe("Canje");
    expect(f.getRadioGroup("otros").getSelected()).toBe("otros paises");
    expect([txt("DNINIE"), txt("Nombre"), txt("Apellido 1"), txt("Apellido 2"), txt("Fecha nacimiento")]).toEqual(["Y1234567Z", "Valentina", "Ríos", "Quispe", "14/02/1991"]);
    expect([txt("País de nacimiento"), txt("Nacionalidad"), txt("Correo electrónico"), txt("Teléfono")]).toEqual(["Perú", "Peruana", "valentina@example.com", "600000000"]);
    expect([txt("Tipo Vía"), txt("Nombre de la vía"), txt("Número"), txt("Planta"), txt("Puerta"), txt("Código Postal"), txt("Localidad")]).toEqual(["Calle", "Mayor", "12", "3º", "2ª", "28013", "Madrid"]);
    expect(f.getDropdown("Provincia").getSelected()).toEqual(["Madrid"]);
    expect(f.getDropdown("Municipio").getSelected()).toEqual(["Madrid"]);
    expect([txt("ClasePermiso"), txt("NumPer"), txt("PaisExp"), txt("FechaExp"), txt("FechaCad")]).toEqual(["A, B", "Q12345678", "Perú", "10/05/2018", "10/05/2028"]);
    expect([txt("ClasePermiso2"), txt("NumPer2")]).toEqual(["", ""]); // la fila de sustitución, intacta
    expect([txt("En"), txt("a"), txt("de"), txt("de_2")]).toEqual(["Madrid", "3", "octubre", "2026"]);
  });

  it("Mod. 03: un permiso de la UE marca «país de la Unión Europea»; sin datos del permiso, esa fila en blanco", async () => {
    const f = await leer(await rellenarMod03({ datos: DATOS, canje: { ...CANJE_VACIO, pais: "Italia" }, lugar: null, fecha: FECHA }));
    expect(f.getRadioGroup("otros").getSelected()).toBe("UE");
    expect(f.getTextField("NumPer").getText() ?? "").toBe("");
    expect(f.getTextField("En").getText() ?? "").toBe("");
  });

  it("Mod. 24: el despacho representa al titular para el «Canje de permiso de conducción» desde hoy", async () => {
    const f = await leer(await rellenarMod24({ datos: DATOS, representante: { documento: "12345678-z", nombre: "Carmen", apellidos: "López García" }, lugar: "Madrid", fecha: FECHA }));
    const txt = (n: string) => f.getTextField(n).getText() ?? "";
    expect([txt("NIFNIECIF"), txt("NombreRazón social"), txt("Apellido 1"), txt("Apellido 2")]).toEqual(["12345678Z", "Carmen", "López", "García"]);
    expect([txt("NIFNIECIF_2"), txt("NombreRazón social_2"), txt("Apellido 1_2"), txt("Apellido 2_2")]).toEqual(["Y1234567Z", "Valentina", "Ríos", "Quispe"]);
    expect(f.getDropdown("Lista de trámites1").getSelected()).toEqual([CODIGO_CANJE_DGT]);
    expect(txt("Fecha InicioRow1")).toBe("03/10/2026");
    expect(f.getCheckBox("Consentimiento representado").isChecked()).toBe(false); // «Me opongo…»: lo decide quien firma
    expect([txt("En"), txt("a"), txt("de"), txt("de_2")]).toEqual(["Madrid", "3", "octubre", "2026"]);
  });
});
