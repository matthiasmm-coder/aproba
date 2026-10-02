import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { leerCertificado } from "@/lib/dehu/certificado";
import { PERSONA_FISICA, p12DePrueba } from "@/lib/dehu/certificados-prueba";
import {
  ErrorDehu, NS, cuerpoLocaliza, cuerpoLocalizaRealizadas, cuerpoPeticionAcceso, fechaXsd, elementoRespuesta, esCertificadoSinAlta, leerDocumento, leerLocaliza, leerLocalizaRealizadas,
  separarMultipart, sobreFirmado,
} from "@/lib/dehu/soap";

const DSIG = "http://www.w3.org/2000/09/xmldsig#";
const { p12, certificadoPem } = p12DePrueba({ sujeto: PERSONA_FISICA });
const cert = leerCertificado(p12, "prueba-1234");

function verificar(xml: string): boolean {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const firma = doc.getElementsByTagNameNS(DSIG, "Signature")[0];
  const v = new SignedXml({ publicCert: certificadoPem, idMode: "wssecurity" });
  v.loadSignature(firma as unknown as Node);
  return v.checkSignature(xml);
}

describe("sobre SOAP firmado (WS-Security)", () => {
  const cuerpo = cuerpoLocaliza({ fechaDesde: new Date("2026-09-18T00:00:00Z"), fechaHasta: new Date("2026-09-30T00:00:00Z") });
  const xml = sobreFirmado(cuerpo, cert, new Date("2026-09-30T08:00:00Z"));

  it("la firma se verifica con el certificado del despacho", () => {
    expect(verificar(xml)).toBe(true);
  });

  it("firma el Timestamp y el Body, en SHA-512 y exc-c14n; el token lleva el certificado", () => {
    expect(xml).toContain('Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"');
    expect(xml.match(/<ds:Reference URI="#/g)?.length).toBe(2);
    expect(xml.match(/xmlenc#sha512/g)?.length).toBe(2);
    expect(xml).toContain('Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"');
    expect(xml).toContain(`>${cert.certificadoDerB64}</wsse:BinarySecurityToken>`);
    expect(xml).toMatch(/<wsse:SecurityTokenReference><wsse:Reference URI="#X509-/);
    expect(xml).toContain("<wsu:Created>2026-09-30T08:00:00.000Z</wsu:Created>");
    expect(xml).toContain("<wsu:Expires>2026-09-30T08:05:00.000Z</wsu:Expires>");
    const idBody = /<soapenv:Body[^>]*wsu:Id="([^"]+)"/.exec(xml)?.[1];
    expect(xml).toContain(`URI="#${idBody}"`);
  });

  it("si alguien toca el cuerpo después de firmar, la firma ya no vale", () => {
    expect(verificar(xml.replace("2026-09-18T02:00:00+02:00", "2026-01-01T02:00:00+02:00"))).toBe(false);
  });

  it("los elementos van en el orden del WSDL y los textos escapados", () => {
    // Espacio de nombres por defecto, sin milisegundos y en hora de Madrid: lo que la DEHú sabe leer (02/10/2026).
    expect(cuerpo).toBe(`<Localiza xmlns="${NS.localiza}"><fechaDesde>2026-09-18T02:00:00+02:00</fechaDesde><fechaHasta>2026-09-30T02:00:00+02:00</fechaHasta></Localiza>`);
    expect(cuerpoLocaliza({ nifTitular: "X1234567L", fechaDesde: new Date("2026-09-20T18:07:20.483Z") }))
      .toBe(`<Localiza xmlns="${NS.localiza}"><nifTitular>X1234567L</nifTitular><fechaDesde>2026-09-20T20:07:20+02:00</fechaDesde></Localiza>`);
    expect(cuerpoLocalizaRealizadas({ nifDestinatario: "12345678Z", fechaHasta: new Date("2026-09-30T00:00:00Z"), pagina: 2 }))
      .toBe(`<LocalizaRealizadas xmlns="${NS.localizaRealizadas}"><nifDestinatario>12345678Z</nifDestinatario><fechaHasta>2026-09-30T02:00:00+02:00</fechaHasta><pagina>2</pagina></LocalizaRealizadas>`);
  });

  it("fechas en hora de Madrid con su desfase, también en invierno y en el cambio de hora", () => {
    expect(fechaXsd(new Date("2026-10-02T18:45:05.123Z"))).toBe("2026-10-02T20:45:05+02:00");
    expect(fechaXsd(new Date("2026-12-15T10:00:00Z"))).toBe("2026-12-15T11:00:00+01:00");
    expect(fechaXsd(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25T02:30:00+02:00"); // antes del cambio
    expect(fechaXsd(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-25T02:30:00+01:00"); // después
    expect(fechaXsd(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01T00:30:00+01:00");
    const pa = cuerpoPeticionAcceso({ identificador: "N-1", codigoOrigen: "7", concepto: "Requerimiento <urgente> & más" }, cert.receptor);
    expect(pa).toContain("<pac:identificador>N-1</pac:identificador><pac:codigoOrigen>7</pac:codigoOrigen><pac:nifReceptor>12345678Z</pac:nifReceptor>");
    expect(pa).toContain("<pac:evento>1</pac:evento><pac:concepto>Requerimiento &lt;urgente&gt; &amp; más</pac:concepto>");
  });
});

const sobre = (cuerpo: string) => `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="${NS.soap}"><soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;

describe("respuestas de la DEHú", () => {
  it("Localiza: envíos con su organismo, titular, vínculo y fecha; hay más resultados", () => {
    const xml = sobre(`<rlo:RespuestaLocaliza xmlns:rlo="http://administracion.gob.es/punto-unico-notificaciones/respuestaLocaliza">
      <rlo:codigoRespuesta>000</rlo:codigoRespuesta><rlo:descripcionRespuesta>Correcto</rlo:descripcionRespuesta><rlo:nifPeticion>12345678Z</rlo:nifPeticion>
      <rlo:envios><rlo:item><rlo:identificador>N123</rlo:identificador><rlo:codigoOrigen>2</rlo:codigoOrigen>
        <rlo:concepto>Requerimiento de documentación</rlo:concepto><rlo:descripcion>Exp. 46/2026/001234</rlo:descripcion>
        <rlo:organismoEmisor><rlo:codigoOrganismo>E04995901</rlo:codigoOrganismo><rlo:nombreOrganismo>Subdelegación del Gobierno en Valencia</rlo:nombreOrganismo></rlo:organismoEmisor>
        <rlo:organismoEmisorRaiz><rlo:codigoOrganismo>E05068001</rlo:codigoOrganismo><rlo:nombreOrganismo>Ministerio de Política Territorial</rlo:nombreOrganismo></rlo:organismoEmisorRaiz>
        <rlo:fechaPuestaDisposicion>2026-09-29T10:15:00.000+02:00</rlo:fechaPuestaDisposicion><rlo:tipoEnvio>2</rlo:tipoEnvio><rlo:vinculo>2</rlo:vinculo>
        <rlo:titular><rlo:nombreTitular>AHMED BENALI</rlo:nombreTitular><rlo:nifTitular>X1234567L</rlo:nifTitular></rlo:titular>
      </rlo:item></rlo:envios><rlo:hayMasResultados>true</rlo:hayMasResultados></rlo:RespuestaLocaliza>`);
    const r = leerLocaliza(elementoRespuesta(xml));
    expect(r.codigo).toBe("000");
    expect(r.hayMas).toBe(true);
    expect(r.envios).toHaveLength(1);
    expect(r.envios[0]).toMatchObject({
      identificador: "N123", codigoOrigen: "2", concepto: "Requerimiento de documentación", descripcion: "Exp. 46/2026/001234",
      organismo: { codigo: "E04995901", nombre: "Subdelegación del Gobierno en Valencia" }, tipoEnvio: 2, vinculo: 2,
      titular: { nombre: "AHMED BENALI", nif: "X1234567L" }, fechaPuestaDisposicion: "2026-09-29T10:15:00.000+02:00",
    });
  });

  it("LocalizaRealizadas: estado, receptor y páginas", () => {
    const xml = sobre(`<lre:RespuestaLocalizaRealizadas xmlns:lre="${NS.localizaRealizadas}"><lre:codigoRespuesta>000</lre:codigoRespuesta><lre:descripcionRespuesta>OK</lre:descripcionRespuesta><lre:nifPeticion>12345678Z</lre:nifPeticion>
      <lre:envios><lre:item><lre:identificador>N9</lre:identificador><lre:codigoOrigen>2</lre:codigoOrigen><lre:concepto>Resolución</lre:concepto>
      <lre:organismoEmisor><lre:codigoOrganismo>E04995901</lre:codigoOrganismo><lre:nombreOrganismo>Oficina de Extranjería de Valencia</lre:nombreOrganismo></lre:organismoEmisor>
      <lre:organismoEmisorRaiz><lre:codigoOrganismo>E05068001</lre:codigoOrganismo><lre:nombreOrganismo>X</lre:nombreOrganismo></lre:organismoEmisorRaiz>
      <lre:fechaPuestaDisposicion>2026-09-20T09:00:00Z</lre:fechaPuestaDisposicion><lre:tipoEnvio>2</lre:tipoEnvio><lre:postal>false</lre:postal><lre:estado>ACEPTADA</lre:estado><lre:vinculo>1</lre:vinculo>
      <lre:titular><lre:nombreTitular>GESTORIA</lre:nombreTitular><lre:nifTitular>B12345674</lre:nifTitular></lre:titular>
      <lre:receptor><lre:nombreReceptor>JUAN</lre:nombreReceptor><lre:nifReceptor>12345678Z</lre:nifReceptor></lre:receptor></lre:item></lre:envios>
      <lre:totalPaginas>2</lre:totalPaginas><lre:paginaActual>1</lre:paginaActual></lre:RespuestaLocalizaRealizadas>`);
    const r = leerLocalizaRealizadas(elementoRespuesta(xml));
    expect(r.totalPaginas).toBe(2);
    expect(r.envios[0]).toMatchObject({ identificador: "N9", estado: "ACEPTADA", receptor: { nombre: "JUAN", nif: "12345678Z" } });
  });

  it("un SOAP Fault es un error con su motivo", () => {
    const xml = sobre(`<soap:Fault><faultcode>soap:Client</faultcode><faultstring>Certificado no autorizado como Gran Destinatario</faultstring></soap:Fault>`);
    expect(() => elementoRespuesta(xml)).toThrow(ErrorDehu);
    expect(() => elementoRespuesta(xml)).toThrow(/Gran Destinatario/);
  });

  it("el 4103 de la DEHú es un certificado sin alta de Gran Destinatario; los demás errores no", () => {
    const xml = sobre(`<soap:Fault><faultcode>soap:Server</faultcode><faultstring>4103 Error en el control de acceso, el certificado utilizado no está autorizado</faultstring></soap:Fault>`);
    let err: unknown = null;
    try { elementoRespuesta(xml); } catch (e) { err = e; }
    expect(esCertificadoSinAlta(err)).toBe(true);
    expect(esCertificadoSinAlta(new ErrorDehu("La DEHú rechazó la petición: 4202 Debe consignarse nifTitular y/o nifDestinatario"))).toBe(false);
    expect(esCertificadoSinAlta(new ErrorDehu("La DEHú no responde (tiempo agotado)."))).toBe(false);
    expect(esCertificadoSinAlta(new Error("4103 no está autorizado"))).toBe(false); // solo un error de la DEHú
    // Producción responde así a un certificado que no conoce (02/10/2026).
    expect(esCertificadoSinAlta(new ErrorDehu("La DEHú rechazó la petición: 4102 No está dado de alta en nuestro sistema"))).toBe(true);
    expect(esCertificadoSinAlta(new ErrorDehu("La DEHú rechazó la petición: 2001 Error interno"))).toBe(false);
  });

  it("la traza del <detail> del Fault se conserva (para el registro de usos), en una línea", () => {
    const xml = sobre(`<soap:Fault><faultcode>Receiver</faultcode><faultstring>2001 Error interno</faultstring><detail>[exception] 0 | Internal Server Error
  at src/Security/AbstractAuthenticate.php:89</detail></soap:Fault>`);
    let err: unknown = null;
    try { elementoRespuesta(xml); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ErrorDehu);
    expect((err as ErrorDehu).message).toBe("La DEHú rechazó la petición: 2001 Error interno");
    expect((err as ErrorDehu).traza).toBe("[exception] 0 | Internal Server Error at src/Security/AbstractAuthenticate.php:89");
  });

  // Un PDF con bytes que parecen saltos de línea y guiones: el troceo va por bytes.
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\r\n--casi-un-boundary\r\n"), Buffer.from([0, 255, 13, 10, 45, 45]), Buffer.from("\r\n%%EOF")]);

  it("PeticionAcceso con el PDF como adjunto (swaRef, multipart/related)", () => {
    const raiz = sobre(`<rpa:RespuestaPeticionAcceso xmlns:rpa="http://administracion.gob.es/punto-unico-notificaciones/respuestaPeticionAcceso"><rpa:codigoRespuesta>000</rpa:codigoRespuesta><rpa:descripcionRespuesta>OK</rpa:descripcionRespuesta>
      <rpa:identificador>N123</rpa:identificador><rpa:codigoOrigen>2</rpa:codigoOrigen><rpa:fechaEvento>2026-09-30T09:12:00+02:00</rpa:fechaEvento>
      <rpa:documento><rpa:nombre>requerimiento.pdf</rpa:nombre><rpa:contenido href="cid:doc-1@dehu">cid:doc-1@dehu</rpa:contenido><rpa:mimeType>application/pdf</rpa:mimeType><rpa:csvResguardo>CSV123</rpa:csvResguardo></rpa:documento>
      </rpa:RespuestaPeticionAcceso>`);
    const cuerpo = Buffer.concat([
      Buffer.from(`--frontera\r\nContent-Type: text/xml; charset=UTF-8\r\nContent-ID: <raiz@dehu>\r\n\r\n${raiz}\r\n`),
      Buffer.from("--frontera\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\nContent-ID: <doc-1@dehu>\r\n\r\n"), pdf,
      Buffer.from("\r\n--frontera--\r\n"),
    ]);
    const { xml, adjuntos } = separarMultipart(cuerpo, 'multipart/related; type="text/xml"; start="<raiz@dehu>"; boundary="frontera"');
    const r = leerDocumento(elementoRespuesta(xml), adjuntos);
    expect(r.fecha).toBe("2026-09-30T09:12:00+02:00");
    expect(r.documento?.nombre).toBe("requerimiento.pdf");
    expect(r.documento?.csv).toBe("CSV123");
    expect(r.documento?.bytes?.equals(pdf)).toBe(true);
  });

  it("ConsultaRealizadas con MTOM/XOP (xop:Include) y con el PDF en base64", () => {
    const raiz = sobre(`<cre:RespuestaConsultaRealizadas xmlns:cre="${NS.consultaRealizadas}" xmlns:xop="http://www.w3.org/2004/08/xop/include"><cre:codigoRespuesta>000</cre:codigoRespuesta><cre:descripcionRespuesta>OK</cre:descripcionRespuesta>
      <cre:identificador>N9</cre:identificador><cre:codigoOrigen>2</cre:codigoOrigen><cre:postal>false</cre:postal><cre:fechaUltimoEstado>2026-09-29T11:00:00Z</cre:fechaUltimoEstado>
      <cre:documento><cre:nombre>resolucion.pdf</cre:nombre><cre:contenido><cre:contenido><xop:Include href="cid:parte2%40dehu"/></cre:contenido><cre:tipoMIME>application/pdf</cre:tipoMIME></cre:contenido></cre:documento>
      </cre:RespuestaConsultaRealizadas>`);
    const cuerpo = Buffer.concat([
      Buffer.from(`--MIMEBoundary_x\r\nContent-Type: application/xop+xml; charset=UTF-8; type="text/xml"\r\nContent-ID: <raiz@dehu>\r\n\r\n${raiz}\r\n`),
      Buffer.from("--MIMEBoundary_x\r\nContent-Type: application/octet-stream\r\nContent-ID: <parte2@dehu>\r\n\r\n"), pdf,
      Buffer.from("\r\n--MIMEBoundary_x--"),
    ]);
    const { xml, adjuntos } = separarMultipart(cuerpo, 'multipart/related; boundary=MIMEBoundary_x; type="application/xop+xml"; start="<raiz@dehu>"');
    const r = leerDocumento(elementoRespuesta(xml), adjuntos);
    expect(r.fecha).toBe("2026-09-29T11:00:00Z");
    expect(r.documento?.mime).toBe("application/pdf");
    expect(r.documento?.bytes?.equals(pdf)).toBe(true);

    const enLinea = sobre(`<cre:RespuestaConsultaRealizadas xmlns:cre="${NS.consultaRealizadas}"><cre:codigoRespuesta>000</cre:codigoRespuesta><cre:descripcionRespuesta>OK</cre:descripcionRespuesta>
      <cre:documento><cre:contenido><cre:contenido>${pdf.toString("base64")}</cre:contenido><cre:tipoMIME>application/pdf</cre:tipoMIME></cre:contenido></cre:documento></cre:RespuestaConsultaRealizadas>`);
    const r2 = leerDocumento(elementoRespuesta(enLinea), new Map());
    expect(r2.documento?.bytes?.equals(pdf)).toBe(true);
  });
});
