import { describe, it, expect } from "vitest";
import { emailLayout } from "./notificaciones";

// Cabecera de los emails al cliente: con logo del despacho → el logo (y el nombre);
// sin logo → la foto del gestor o las iniciales, como siempre.
const base = { gestoria: "Gestoría Vallès", titulo: "Documento recibido", cuerpoHtml: "<p>Hola</p>" };

describe("emailLayout · logo del despacho", () => {
  it("con logo, la cabecera lleva el logo y el nombre, sin iniciales ni foto", () => {
    const html = emailLayout({ ...base, logoUrl: "https://cdn.example.com/avatares/logo-ws.png?v=1", avatarUrl: "https://cdn.example.com/avatares/u1.jpg" });
    expect(html).toContain('<img src="https://cdn.example.com/avatares/logo-ws.png?v=1"');
    expect(html).not.toContain("avatares/u1.jpg");
    expect(html).not.toMatch(/>GV</);
    expect(html).toContain("letter-spacing:-0.01em\">Gestoría Vallès</td>"); // el nombre siempre al lado del logo
    expect(html).toContain('alt="Gestoría Vallès"');
  });
  it("sin logo, foto del gestor si la hay; si no, iniciales", () => {
    expect(emailLayout({ ...base, avatarUrl: "https://cdn.example.com/avatares/u1.jpg" })).toContain("avatares/u1.jpg");
    expect(emailLayout({ ...base })).toMatch(/>GV</);
    expect(emailLayout({ ...base, logoUrl: "  " })).toMatch(/>GV</); // vacío = sin logo
  });
});
