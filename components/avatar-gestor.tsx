"use client";

import { createContext, useContext } from "react";

// Avatar de un MIEMBRO del despacho: su foto si la tiene, sus iniciales si no.
// Una sola pieza para las tres superficies donde aparece (lista de expedientes,
// tablero y carga del equipo en Inicio): antes cada una pintaba sus iniciales y la
// foto del gestor solo se veía en la barra lateral.

const iniciales = (nombre: string) =>
  nombre.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export type Avatares = Record<string, string | null | undefined>;

export function AvatarGestor({ nombre, foto, size = 24, className = "" }: {
  nombre: string;
  foto?: string | null;
  size?: number;
  className?: string;
}) {
  const lado = { width: size, height: size };
  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={foto} alt={nombre} title={nombre} style={lado}
        className={`shrink-0 rounded-full object-cover ring-1 ring-aproba-100 ${className}`}
      />
    );
  }
  return (
    <span
      title={nombre} style={{ ...lado, fontSize: Math.max(9, Math.round(size * 0.42)) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-aproba-100 font-semibold text-aproba-700 ${className}`}
    >
      {iniciales(nombre)}
    </span>
  );
}

// El mapa se pone UNA vez por pantalla y lo lee cualquier fila, por profunda que esté.
const Ctx = createContext<Avatares>({});
export const AvataresProvider = Ctx.Provider;
export const useAvatar = (nombre: string): string | null => useContext(Ctx)[nombre] ?? null;
