import { describe, it, expect } from "vitest";
import { parseFormulario052, parseProvincias, importe052, partirDomicilio052, codigoProvincia, cuerpoLatin1, fechaLarga052, sinAcentos } from "./tasa790052";

// Helpers puros de la tasa 790-052. El flujo real (sesión + captcha + PDF) se prueba a mano
// contra la Sede; aquí, sin red, los parsers sobre un recorte fiel del HTML oficial
// (prepareTasa, 08/09/2026) y la aritmética del importe.

const FORM = `
<form name="PrincipalForm" action="generaDocPDF" method="POST"><input type="hidden" name="reglamento" value="RD1155/2024" />
<input type="text" name="Ctrl_NumJustificante" Id="Ctrl_NumJustificante" value="7900527486092" readonly />
<select name="Ctrl_SelNacionalidad" size="1" Id="Ctrl_SelNacionalidad"><option value="ESPAÑA">ESPAÑA</option><option value="COLOMBIA">COLOMBIA</option></select>
<script>nombre_provincias[1]="A CORUÑA"; id_provincias[1]="15"; nombre_provincias[2]="BARCELONA"; id_provincias[2]="08";</script>
<TR><TD class="normalgrande bordeContenidoRight" valign="top" align="right"> 2.1 </TD><TD class="normalgrande bordeContenido" valign="top" colspan="3"> Autorización inicial de residencia temporal </TD></TR>
<TR><TD class="normal bordeContenidoRight"> 2.1.1 </TD><TD class="normal bordeContenido"><label for="epigrafe2.1.1">Residencia temporal no lucrativa (titular principal y sus familiares)</label></TD>
<TD class="bordeContenidoCenter"><input type="checkbox" id="epigrafe2.1.1" name="epigrafe2.1.1" class="epigrafe" /></TD><TD class="normal bordeContenidoRight" valign="right"> 10,94 </TD></TR>
<TR><TD class="normalgrande bordeContenidoRight"> 1.2 </TD><TD class="normalgrande bordeContenido" colspan="3"> Prórroga de estancia de corta duración </TD></TR>
<TR><TD class="normal bordeContenidoRight"> 1.2.1 </TD><TD class="normal bordeContenido"><label for="epigrafe1.2.1">Prórroga sin visado (importe base más <input type="text" name="Ctrl_Importe052_1_2_1_0" value="1,09" /> por día)</label></TD>
<TD><input type="checkbox" id="epigrafe1.2.1" name="epigrafe1.2.1" class="epigrafe" /></TD><TD class="normal bordeContenidoRight"> 17,49 </TD></TR>
<TR><TD class="normalgrande bordeContenidoRight"> 2.6 </TD><TD class="normalgrande bordeContenido" colspan="3"> Larga duración </TD></TR>
<TR><TD class="normal bordeContenidoRight"> 2.6.1 </TD><TD class="bordeContenidoCenter"><input type="checkbox" id="epigrafe2.6.1" name="epigrafe2.6.1" class="epigrafe" /></TD><TD class="normal bordeContenidoRight"> 21,87 </TD></TR>
</form>`;

describe("parseFormulario052", () => {
  const f = parseFormulario052(FORM);
  it("lee el justificante, el reglamento y los desplegables", () => {
    expect(f.justificante).toBe("7900527486092");
    expect(f.reglamento).toBe("RD1155/2024");
    expect(f.nacionalidades).toEqual(["ESPAÑA", "COLOMBIA"]);
    expect(f.provinciasDom).toEqual(["A CORUÑA", "BARCELONA"]);
  });
  it("lee los epígrafes con importe, sección y el importe por día", () => {
    expect(f.epigrafes.map((e) => e.codigo)).toEqual(["1.2.1", "2.1.1", "2.6.1"]);
    const e211 = f.epigrafes.find((e) => e.codigo === "2.1.1")!;
    expect(e211.importe).toBe("10,94");
    expect(e211.label).toMatch(/^Residencia temporal no lucrativa/);
    expect(e211.seccion).toBe("Autorización inicial de residencia temporal");
    expect(f.epigrafes.find((e) => e.codigo === "1.2.1")!.porDia).toBe("1,09");
    // Sin <label>: el título de la sección es la descripción.
    const e261 = f.epigrafes.find((e) => e.codigo === "2.6.1")!;
    expect(e261.label).toBe("Larga duración");
    expect(e261.importe).toBe("21,87");
  });
});

describe("parseProvincias", () => {
  it("lee el mapa de la Sede sin duplicados, ordenado", () => {
    const html = `<area onclick="confirmarProvincia('prepareTasa?idTasa=052&idModelo=790&idProvincia=15','A Coruña')"/><area onclick="confirmarProvincia('prepareTasa?idTasa=052&idModelo=790&idProvincia=08','Barcelona')"/><area onclick="confirmarProvincia('prepareTasa?idProvincia=08','Barcelona')"/>`;
    expect(parseProvincias(html)).toEqual([{ id: "15", nombre: "A Coruña" }, { id: "08", nombre: "Barcelona" }]);
  });
});

describe("importe052", () => {
  const base = { id: "epigrafe2.1.1", codigo: "2.1.1", label: "", importe: "10,94", seccion: "" };
  it("importe fijo", () => expect(importe052(base)).toEqual({ euros: "10", centimos: "94", total: "10,94" }));
  it("por días: base + días × importe/día, ambos extremos incluidos (como la Sede)", () => {
    const e = { ...base, codigo: "1.2.1", importe: "17,49", porDia: "1,09" };
    expect(importe052(e, "2026-09-01", "2026-09-10")).toEqual({ euros: "28", centimos: "39", total: "28,39" }); // 17,49 + 10 × 1,09
    expect(importe052(e, "2026-09-10", "2026-09-01")).toBeNull();
    expect(importe052(e)).toBeNull();
  });
});

describe("helpers de dirección y provincia", () => {
  it("partirDomicilio052 lleva el tipo de vía al desplegable oficial", () => {
    expect(partirDomicilio052("C/ Mallorca 245, 3º 2ª")).toEqual({ tipoVia: "CALLE", via: "Mallorca", numero: "245", piso: "3º2ª" });
    expect(partirDomicilio052("Avda. Diagonal 100")).toEqual({ tipoVia: "AVENIDA", via: "Diagonal", numero: "100", piso: "" });
    expect(partirDomicilio052("Plaza Mayor")).toEqual({ tipoVia: "PLAZA", via: "Mayor", numero: "", piso: "" });
  });
  it("codigoProvincia por nombre (acentos aparte) o por C.P.", () => {
    expect(codigoProvincia("Barcelona")).toBe("08");
    expect(codigoProvincia("A Coruña")).toBe("15");
    expect(codigoProvincia("Girona")).toBe("17");
    expect(codigoProvincia("", "28013")).toBe("28");
    expect(codigoProvincia("Marte", "99999")).toBe("");
  });
  it("sinAcentos como los valores oficiales", () => expect(sinAcentos("España · Girona")).toBe("ESPANA · GIRONA"));
});

describe("cuerpoLatin1 y fecha", () => {
  it("codifica en ISO-8859-1 (Ñ = %D1) y respeta la forma urlencoded", () => {
    expect(cuerpoLatin1({ Ctrl_Apellido1: "MUÑOZ PEÑA", x: "a b&c" })).toBe("Ctrl_Apellido1=MU%D1OZ+PE%D1A&x=a+b%26c");
  });
  it("fecha larga como la escribe la Sede", () => expect(fechaLarga052(new Date(2026, 8, 8))).toBe("a 8 de septiembre de 2026"));
});
