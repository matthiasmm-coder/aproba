import { describe, it, expect } from "vitest";
import { parseFormulario062, importe062, esPaginaAceptacion062, cuerpoAceptacion062, nombreTrabajador062, direccionTrabajador062, EPIGRAFES_RENOVACION_062, PROVINCIAS_CATALUNA } from "./tasa790062";

// Helpers puros de la tasa 790-062. El flujo real (sesión + nota + captcha + PDF) se prueba a
// mano contra la Sede; aquí, sin red, el parser sobre un RECORTE FIEL del impreso oficial
// (prepareTasa tras aceptar la nota, provincia 08, RD 1155/2024, 14/09/2026) y la aritmética.
// Filas elegidas a propósito: 2.1.1/2.1.2 (con <label>, dos importes según el SMI), 2.2.1
// (renovación, sección «2.2» inexistente → hereda la «2.»), 3.1.1 (fila resaltada con clases
// bordeBlanco…, la que el regex de la 052 leía como «4.1.1 €») y 5.1.1 (sin <label>: la
// descripción es la celda de título de su propia fila).

const FORM = `<form name="PrincipalForm" action="generaDocPDF" method="POST" id="PrincipalForm" >
<input type="hidden" name="reglamento" value="RD1155/2024">
<input id="Ctrl_NumJustificante" type="text" name="Ctrl_NumJustificante" readOnly size="16" value="7900627126156" tabIndex="-1" style="font-size:14px;text-align:center" class="textonegrita" onfocus="FnCmn_MostrarMensajeAyuda(this)" onmouseover="FnCmn_MostrarMensajeAyuda(this)"/>
<input type="text" Id="Nombre_Trabajador" name="Nombre_Trabajador" class="lineablanca" style="width:97%;" value ="" size="20"/>
<input type="text" Id="Nacionalidad_Trabajador" name="Nacionalidad_Trabajador" class="lineablanca" style="width:94%;" value ="" size="20"/>
<input type="text" Id="Direccion_Trabajador" name="Direccion_Trabajador" class="lineablanca" style="width:97%;" value="" size="20"/>
<script>nombre_provincias[1]="A CORUÑA"; id_provincias[1]="15"; nombre_provincias[2]="BARCELONA"; id_provincias[2]="08";</script>
<TR style="background-color: grey"> <TD class="normalgrandenegrita bordeContenidoRight" align="right" valign="top"> 2. </td> <TD class="normalgrandenegrita bordeContenido" colspan="3" valign="top"> Tramitación de autorizaciones de trabajo por cuenta ajena </TD> </TR>
<TR style="background-color: darkgrey"> <TD class="normalgrande bordeContenidoRight" valign="top" align="right"> 2.1 </TD> <TD class="normalgrande bordeContenido" valign="top" colspan="3"> Autorización de trabajo para autorizaciones iniciales de residencia temporal de trabajo por cuenta ajena </TD> </TR>
<TR style="background-color: lightgrey"> <TD class="normal bordeContenidoRight" valign="top" align="right"> 2.1.1 </TD> <TD class="normal bordeContenido" valign="top"> <label for="epigrafe2.1.1">Retribución inferior a 2 veces SMI</label> </TD> <TD class="bordeContenidoCenter" valign="center" > <input type="checkbox" id="epigrafe2.1.1" name="epigrafe2.1.1" class="epigrafe" onfocus="FnCmn_MostrarMensajeAyuda(this)" onmouseover="FnCmn_MostrarMensajeAyuda(this)" onclick="Fn_CalcularImporte()" /> </TD> <TD class="normal bordeContenidoRight" valign="center" > 203,84 </TD> </TR>
<TR style="background-color: lightgrey"> <TD class="normal bordeContenidoRight" valign="top" align="right"> 2.1.2 </TD> <TD class="normal bordeContenido" valign="top"> <label for="epigrafe2.1.2">Retribución igual o superior a 2 veces SMI</label> </TD> <TD class="bordeContenidoCenter" valign="center" > <input type="checkbox" id="epigrafe2.1.2" name="epigrafe2.1.2" class="epigrafe" onfocus="FnCmn_MostrarMensajeAyuda(this)" onmouseover="FnCmn_MostrarMensajeAyuda(this)" onclick="Fn_CalcularImporte()" /> </TD> <TD class="normal bordeContenidoRight" valign="center" > 407,71 </TD> </TR>
<TR style="background-color: darkgrey"> <TD class="normalgrande bordeContenidoRight" valign="top" align="right"> 2.2 </TD> <TD class="normalgrande bordeContenido" valign="top"> <label for="epigrafe2.2.1">Autorización de trabajo para autorizaciones renovadas de residencia temporal de trabajo por cuenta ajena</label> </TD> <TD class="bordeContenidoCenter" valign="center" > <input type="checkbox" id="epigrafe2.2.1" name="epigrafe2.2.1" class="epigrafe" onfocus="FnCmn_MostrarMensajeAyuda(this)" onmouseover="FnCmn_MostrarMensajeAyuda(this)" onclick="Fn_CalcularImporte()" /> </TD> <TD class="normal bordeContenidoRight" valign="center" > 81,54 </TD> </TR>
<TR style="background-color: grey"> <TD class="normalgrandenegrita bordeContenidoRight" align="right" valign="top"> 3. </td> <TD class="normalgrandenegrita bordeContenido" colspan="3" valign="top"> Tramitación de autorizaciones de trabajo por cuenta propia </TD> </TR>
<TR style="background-color: darkgrey"> <TD class="normalgrande bordeBlancoRight" valign="top" align="right"> 3.1 </TD> <TD class="normalgrande bordeBlancoLeft" valign="top"> <label for="epigrafe3.1.1">Autorización de trabajo para autorizaciones iniciales de residencia temporal de trabajo por cuenta propia</label> </TD> <TD class="bordeBlancoCenter" valign="center" > <input type="checkbox" id="epigrafe3.1.1" name="epigrafe3.1.1" class="epigrafe" onfocus="FnCmn_MostrarMensajeAyuda(this)" onmouseover="FnCmn_MostrarMensajeAyuda(this)" onclick="Fn_CalcularImporte()" /> </TD> <TD class="normal bordeBlancoRight" valign="center" > 203,84 </TD> </TR>
<TR style="background-color: grey"> <TD class="normalgrandenegrita bordeContenidoRight" align="right" valign="top"> 5. </td> <TD class="normalgrandenegrita bordeContenido" colspan="1" valign="top" for="epigrafe5.1.1"> Tramitación de autorización inicial de trabajo para las personas titulares de autorización de estancia de larga duración por estudios, movilidad de alumnos, servicios de voluntariado o actividades formativas (art 52, apartados b), c), d) y e)) </TD> <TD class="bordeContenidoCenter" valign="center" > <input type="checkbox" id="epigrafe5.1.1" name="epigrafe5.1.1" class="epigrafe" onfocus="FnCmn_MostrarMensajeAyuda(this)" onmouseover="FnCmn_MostrarMensajeAyuda(this)" onclick="Fn_CalcularImporte()" /> </TD> <TD class="normal bordeContenidoRight" valign="center" > 122,30 </TD> </TR>
</form>`;

describe("parseFormulario062", () => {
  const f = parseFormulario062(FORM);
  it("lee el justificante, el reglamento y las provincias del domicilio", () => {
    expect(f.justificante).toBe("7900627126156");
    expect(f.reglamento).toBe("RD1155/2024");
    expect(f.provinciasDom).toEqual(["A CORUÑA", "BARCELONA"]);
  });
  it("lee las líneas con su importe, su descripción y su sección", () => {
    expect(f.epigrafes.map((e) => e.codigo)).toEqual(["2.1.1", "2.1.2", "2.2.1", "3.1.1", "5.1.1"]);
    const e211 = f.epigrafes.find((e) => e.codigo === "2.1.1")!;
    expect(e211.importe).toBe("203,84");
    expect(e211.label).toMatch(/inferior a 2 veces SMI/);
    expect(e211.seccion).toMatch(/^Autorización de trabajo para autorizaciones iniciales/);
    expect(f.epigrafes.find((e) => e.codigo === "2.1.2")!.importe).toBe("407,71");
    const e221 = f.epigrafes.find((e) => e.codigo === "2.2.1")!;
    expect(e221.importe).toBe("81,54");
    expect(e221.seccion).toMatch(/cuenta ajena/);
    // Fila resaltada (clases bordeBlanco…): el importe es el suyo, no el código de otra línea.
    const e311 = f.epigrafes.find((e) => e.codigo === "3.1.1")!;
    expect(e311.importe).toBe("203,84");
    expect(e311.label).toMatch(/cuenta propia/);
    // Sin <label>: la celda de título de su fila es la descripción.
    const e511 = f.epigrafes.find((e) => e.codigo === "5.1.1")!;
    expect(e511.importe).toBe("122,30");
    expect(e511.label).toMatch(/estancia de larga duración/);
  });
});

describe("nota de aceptación", () => {
  it("distingue la página de la nota del impreso", () => {
    expect(esPaginaAceptacion062('<form action="prepareTasa" method="post"><input type="hidden" name="aceptado" value="OK"></form>')).toBe(true);
    expect(esPaginaAceptacion062(FORM)).toBe(false);
  });
  it("envía exactamente lo que envía el botón «Aceptar» de la Sede", () => {
    expect(cuerpoAceptacion062("08", "RD1155/2024")).toBe("Aceptar=Aceptar&idTasa=062&aceptado=OK&idModelo=790&idProvincia=08&reglamento=RD1155%2F2024");
  });
});

describe("importe062 y datos del trabajador", () => {
  it("importe fijo, en euros y céntimos", () => {
    expect(importe062({ id: "epigrafe2.2.1", codigo: "2.2.1", label: "", importe: "81,54", seccion: "" })).toEqual({ euros: "81", centimos: "54", total: "81,54" });
    expect(importe062(undefined)).toBeNull();
    expect(importe062({ id: "x", codigo: "x", label: "", importe: "0,00", seccion: "" })).toBeNull();
  });
  it("«Apellidos y Nombre» y «Dirección postal completa» como los espera el impreso", () => {
    expect(nombreTrabajador062("García", "Pérez", "Ana")).toBe("GARCIA PEREZ, ANA");
    expect(nombreTrabajador062("Muñoz", "", "")).toBe("MUNOZ");
    expect(direccionTrabajador062({ domicilio: "C/ Mallorca", numero: "245", piso: "3º 2ª", cp: "08008", localidad: "Barcelona", provincia: "Barcelona" })).toBe("C/ MALLORCA 245, 3º 2ª, 08008 BARCELONA");
    expect(direccionTrabajador062({ domicilio: "Avda. Diagonal 100", numero: "", piso: "", cp: "17001", localidad: "Girona", provincia: "Girona" })).toBe("AVDA. DIAGONAL 100, 17001 GIRONA");
    expect(direccionTrabajador062({ domicilio: "Plaza Mayor 1", numero: "", piso: "", cp: "28013", localidad: "Alcobendas", provincia: "Madrid" })).toBe("PLAZA MAYOR 1, 28013 ALCOBENDAS (MADRID)");
  });
  it("Cataluña: solo las renovaciones/prórrogas siguen siendo 062", () => {
    expect(PROVINCIAS_CATALUNA).toEqual(["08", "17", "25", "43"]);
    expect(EPIGRAFES_RENOVACION_062).toContain("2.2.1");
    expect(EPIGRAFES_RENOVACION_062).not.toContain("2.1.1");
  });
});
