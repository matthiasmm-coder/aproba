import { describe, expect, it } from "vitest";
import { MARCADOR, marcadorDeAsunto, sinTextoCitado,
  direccionEntrante, tokenDeDireccion, tokenDeDestinatarios, direccionDe, nombreDe, limpiarCuerpo,
  extraerPistas, emparejarCliente, extensionAdmitida, nombreArchivoSeguro, generarTokenEntrante, type ClienteCandidato,
} from "./email-entrante";

const clientes: ClienteCandidato[] = [
  { id: "c1", nombre: "Fatima", apellidos: "El Amrani", email: "fatima@example.com", telefono: "612 345 678", numeroDocumento: "Y1234567L" },
  { id: "c2", nombre: "Karim", apellidos: "Benali", email: null, telefono: "+34 699 000 111", numeroDocumento: "X7654321K" },
  { id: "c3", nombre: "Ana", apellidos: null, email: "ana@example.com", telefono: null, numeroDocumento: null },
  { id: "c4", nombre: "Karim", apellidos: "Benali", email: "karim2@example.com", telefono: null, numeroDocumento: null }, // homónimo
];

describe("dirección de recepción", () => {
  it("construye y reconoce la dirección del despacho", () => {
    const d = direccionEntrante("abc123def4");
    expect(d).toBe("docs-abc123def4@in.aproba-software.com");
    expect(tokenDeDireccion(d)).toBe("abc123def4");
    expect(tokenDeDireccion("Gestoría <DOCS-ABC123DEF4@in.aproba-software.com>")).toBe("abc123def4");
  });
  it("ignora otros dominios y direcciones sin token", () => {
    expect(tokenDeDireccion("docs-abc123def4@otro.com")).toBeNull();
    expect(tokenDeDireccion("hola@in.aproba-software.com")).toBeNull();
    expect(tokenDeDestinatarios([["juan@gmail.com"], null, ["docs-zzz999zzz9@in.aproba-software.com"]])).toBe("zzz999zzz9");
  });
  it("genera tokens de 10 caracteres sin ambigüedades", () => {
    const t = generarTokenEntrante();
    expect(t).toMatch(/^[a-km-np-z2-9]{10}$/);
    expect(generarTokenEntrante()).not.toBe(t);
  });
});

describe("remitente y cuerpo", () => {
  it("separa nombre y dirección", () => {
    expect(direccionDe("Juan Prado <JuanSprado@Gmail.com>")).toBe("juansprado@gmail.com");
    expect(nombreDe("Juan Prado <juansprado@gmail.com>")).toBe("Juan Prado");
    expect(nombreDe("juansprado@gmail.com")).toBeNull();
  });
  it("prefiere el texto y limpia el HTML si no lo hay", () => {
    expect(limpiarCuerpo("  hola\n\n\n\nadiós ", "<p>no</p>")).toBe("hola\n\nadiós");
    expect(limpiarCuerpo(null, "<div>De: <b>Fatima</b> &lt;fatima@example.com&gt;<br>Adjunto pasaporte</div><style>p{}</style>")).toContain("De: Fatima <fatima@example.com>");
  });
});

describe("pistas y emparejamiento", () => {
  it("reconoce por email exacto, excluyendo a los miembros del despacho", () => {
    const p = extraerPistas("Fwd: documentos\nDe: fatima@example.com\nreenviado por gestor@despacho.es", ["gestor@despacho.es"]);
    expect(p.emails).toEqual(["fatima@example.com"]);
    expect(emparejarCliente(clientes, p)).toMatchObject({ cliente: { id: "c1" }, motivo: "email" });
  });
  it("reconoce por número de documento con separadores", () => {
    const p = extraerPistas("Adjunto la TIE de mi cliente x-7654321-k para la renovación");
    expect(p.documentos).toContain("X7654321K");
    expect(emparejarCliente(clientes, p).cliente?.id).toBe("c2");
  });
  it("reconoce por teléfono en cualquier formato", () => {
    const p = extraerPistas("me lo manda desde el 699 000 111");
    expect(p.telefonos).toEqual(["+34699000111"]);
    expect(emparejarCliente(clientes, p)).toMatchObject({ cliente: { id: "c2" }, motivo: "teléfono" });
  });
  it("por nombre completo solo si es único; un homónimo va a la bandeja", () => {
    const solo = extraerPistas("Documentos de Fátima El Amrani para el arraigo");
    expect(emparejarCliente(clientes, solo)).toMatchObject({ cliente: { id: "c1" }, motivo: "nombre" });
    const dudoso = extraerPistas("Papeles de Karim Benali");
    const r = emparejarCliente(clientes, dudoso);
    expect(r.cliente).toBeNull();
    expect(r.motivo).toMatch(/ambiguo/);
    expect(r.candidatos.sort()).toEqual(["c2", "c4"]);
  });
  it("un nombre de pila solo no decide", () => {
    expect(emparejarCliente(clientes, extraerPistas("hola Ana, te paso esto")).cliente).toBeNull();
  });
  it("sin pistas → sin coincidencia", () => {
    expect(emparejarCliente(clientes, extraerPistas("Buenos días, adjunto documentación."))).toMatchObject({ cliente: null, motivo: "sin coincidencia" });
  });
  it("la dirección de recepción no cuenta como pista", () => {
    const p = extraerPistas("Para: docs-abc123def4@in.aproba-software.com\nDe: fatima@example.com");
    expect(p.emails).toEqual(["fatima@example.com"]);
  });
});

describe("adjuntos", () => {
  it("admite PDF e imágenes hasta 8 MB, por tipo o por extensión", () => {
    expect(extensionAdmitida({ filename: "pasaporte.PDF", content_type: "application/octet-stream", size: 1000 })).toBe("pdf");
    expect(extensionAdmitida({ filename: "foto.jpeg", content_type: "image/jpeg", size: 1000 })).toBe("jpg");
    expect(extensionAdmitida({ filename: "hoja.docx", content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000 })).toBeNull();
    expect(extensionAdmitida({ filename: "grande.pdf", content_type: "application/pdf", size: 9 * 1024 * 1024 })).toBeNull();
  });
  it("descarta los logos de firma (inline pequeños con content-id) pero no las fotos inline", () => {
    expect(extensionAdmitida({ filename: "logo.png", content_type: "image/png", size: 12_000, content_disposition: "inline", content_id: "img1" })).toBeNull();
    expect(extensionAdmitida({ filename: "IMG_2031.jpg", content_type: "image/jpeg", size: 2_400_000, content_disposition: "inline", content_id: "img2" })).toBe("jpg");
  });
  it("normaliza el nombre del archivo", () => {
    expect(nombreArchivoSeguro("Pasaporte Fátima (2026).pdf", "pdf", 0)).toBe("Pasaporte-Fatima-2026.pdf");
    expect(nombreArchivoSeguro(null, "jpg", 2)).toBe("adjunto-3.jpg");
  });
});


describe("hilo de respuesta · marcador y texto propio", () => {
  it("el marcador viaja en el asunto y se recupera de un «Re:»", () => {
    const m = MARCADOR("3f2a9c1e-77b1-4c4d-9c1a-0f0e1d2c3b4a");
    expect(m).toBe("[APROBA-3f2a9c1e]");
    expect(marcadorDeAsunto(`Re: Fwd: Documentos · ¿de quién es? ${m}`)).toBe("3f2a9c1e");
    expect(marcadorDeAsunto("Fwd: Documentos de Fatima")).toBeNull();
  });
  it("solo cuenta lo que escribió el gestor, no la cita del email anterior", () => {
    const cuerpo = "Es de Fatima El Amrani\n\nEl 6 sept 2026, a las 10:02, Gestoría escribió:\n> Ha llegado un email…\n> con 2 adjuntos";
    expect(sinTextoCitado(cuerpo)).toBe("Es de Fatima El Amrani");
    expect(sinTextoCitado("De: Aproba <avisos@aproba-software.com>\nHola")).toBe("");
    expect(sinTextoCitado("> cita\nRespuesta")).toBe("Respuesta");
  });
});
