"use client";

import { useEffect, useState } from "react";
import { conBarras, isoDesdeDigitos, soloDigitos, visualDesdeIso } from "@/lib/fecha";

// Fecha escrita a mano, con las barras puestas solas (dd/mm/aaaa).
//
// Por qué no `<input type="date">`: en el móvil abre el calendario nativo, y para una
// fecha de NACIMIENTO obliga a retroceder décadas mes a mes — el cliente abandona
// (reportado por Matthias). Aquí se teclean 8 cifras y ya está; el teclado que sale es
// el numérico (`inputMode`).
//
// Contrato: `value` y `onChange` hablan ISO (AAAA-MM-DD), como el resto de la app.

export function FechaInput({
  value,
  onChange,
  className = "",
  id,
  name,
  autoComplete = "bday",
  placeholder = "dd/mm/aaaa",
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  id?: string;
  name?: string;
  autoComplete?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  // Texto tecleado: vive aparte del ISO porque una fecha a medias no tiene ISO.
  const [texto, setTexto] = useState(() => visualDesdeIso(value));

  // El padre puede cambiar el valor (carga de la ficha, reinicio del formulario):
  // solo se pisa lo tecleado si de verdad es otra fecha.
  useEffect(() => {
    const v = visualDesdeIso(value);
    setTexto((prev) => (isoDesdeDigitos(soloDigitos(prev)) === value ? prev : v));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      id={id}
      name={name}
      value={texto}
      autoComplete={autoComplete}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={10}
      onChange={(e) => {
        const d = soloDigitos(e.target.value);
        setTexto(conBarras(d));
        onChange(isoDesdeDigitos(d));
      }}
      className={className}
    />
  );
}
