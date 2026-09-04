// Ficha de contacto del fundador — fuente ÚNICA de los datos que van en la tarjeta
// de visita, en la página /m y en el archivo .vcf. Si cambia un dato, cambia aquí:
// el QR grabado en la tarjeta apunta a /m, así que la tarjeta nunca queda obsoleta.

export const CONTACTO = {
  nombre: "Matthias Merle Mounier",
  nombrePila: "Matthias",
  apellidos: "Merle Mounier",
  cargo: "Fundador",
  empresa: "Aproba",
  telefono: "+33695743596",
  telefonoVisible: "+33 6 95 74 35 96",
  email: "matthias@aproba-software.com",
  web: "https://aproba-software.com",
  webVisible: "aproba-software.com",
  claim: "El software para profesionales de extranjería",
  // Mensaje ya escrito al abrir WhatsApp: la conversación empieza sin que nadie teclee.
  whatsappTexto: "Hola Matthias, nos hemos conocido y me gustaría saber más de Aproba.",
} as const;

export function whatsappUrl(texto: string = CONTACTO.whatsappTexto): string {
  return `https://wa.me/${CONTACTO.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

// vCard 3.0 — el formato que entienden iOS, Android y Outlook sin excepción.
// Sin PHOTO: el plegado de líneas base64 es la causa nº 1 de vCards que no importan.
export function vcard(): string {
  const c = CONTACTO;
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${c.apellidos};${c.nombrePila};;;`,
    `FN:${c.nombre}`,
    `ORG:${c.empresa}`,
    `TITLE:${c.cargo}`,
    `TEL;TYPE=CELL:${c.telefono}`,
    `EMAIL;TYPE=INTERNET:${c.email}`,
    `URL:${c.web}`,
    `NOTE:${c.claim}`,
    "END:VCARD",
  ].join("\r\n") + "\r\n";
}
