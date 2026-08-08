"use client";

import { useState } from "react";
import { PREFIJOS, PREFIJO_POR_DEFECTO, separarTelefono, unirTelefono } from "@/lib/telefonos";

// Campo de teléfono con selector de PREFIJO internacional. Se usa igual en la app del
// gestor y en los portales del cliente (que tienen sistemas de traducción distintos):
// por eso las etiquetas llegan por props, sin depender de ningún provider.
//
// Valor único: el componente sigue guardando UN string («+34 612 345 678»), así que no
// cambia el esquema (Cliente.telefono) ni ninguna API.
//
// Regla anti-destrucción: un teléfono YA guardado sin prefijo (importaciones, datos
// antiguos) NO se atribuye a España — el selector muestra «—» hasta que el usuario elija.
// Solo un campo VACÍO arranca en España, que es el caso real del 90 % de las altas.

export function TelefonoInput({
  value,
  onChange,
  className = "",
  placeholder = "612 345 678",
  id,
  name,
  disabled,
  labelPrefijo = "Prefijo de país",
  labelSinPrefijo = "— Sin prefijo",
  autoComplete = "tel",
}: {
  value: string;
  onChange: (valor: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  labelPrefijo?: string;
  labelSinPrefijo?: string;
  autoComplete?: string;
}) {
  const { dial: dialDetectado, numero } = separarTelefono(value);
  // El prefijo elegido vive en local mientras el número está vacío (unirTelefono
  // devuelve "" sin número, así que no podría deducirse del valor).
  const [dialElegido, setDialElegido] = useState<string | null>(null);
  const dial = dialDetectado || dialElegido || (value.trim() ? "" : PREFIJO_POR_DEFECTO);

  // Los anchos van en ENVOLTORIOS, no en el select/input: la className que llega del
  // formulario suele traer `w-full`, que en Tailwind gana a cualquier `w-32` puesto
  // aquí (misma capa, orden del CSS) — el selector se comía la línea y el número
  // quedaba en 26 px. Con envoltorios el reparto es determinista.
  return (
    <div className="flex items-stretch gap-2">
      <div className="w-32 shrink-0">
        <select
          aria-label={labelPrefijo}
          value={dial}
          disabled={disabled}
          onChange={(e) => {
            setDialElegido(e.target.value);
            onChange(unirTelefono(e.target.value, numero));
          }}
          className={`w-full bg-white ${className}`}
        >
          {!dial && <option value="">{labelSinPrefijo}</option>}
          {PREFIJOS.map((p) => (
            <option key={`${p.code}${p.dial}`} value={p.dial}>{`${p.flag} ${p.dial} ${p.nombre}`}</option>
          ))}
        </select>
      </div>
      <div className="min-w-0 flex-1">
        <input
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          id={id}
          name={name}
          disabled={disabled}
          value={numero}
          placeholder={placeholder}
          onChange={(e) => onChange(unirTelefono(dial, e.target.value))}
          className={`w-full ${className}`}
        />
      </div>
    </div>
  );
}
