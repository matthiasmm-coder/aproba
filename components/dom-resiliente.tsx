"use client";

// Blindaje contra el traductor del navegador (caso real, 13/08: un cliente final en su
// portal /j con Chrome traduciendo la página → «NotFoundError: removeChild … is not a
// child of this node» → pantalla rota a mitad de trámite).
//
// Google Translate reemplaza los nodos de texto por <font>: React ya no encuentra los
// nodos que él mismo creó y removeChild/insertBefore revientan. Es el problema conocido
// de React #11538; el remedio estándar es tolerar la operación imposible en vez de
// tirar la página. NUESTRO público es el que más traduce (el portal existe en 8 idiomas,
// pero un cliente en tagalo o wolof traduce igual) — bloquear la traducción con
// translate="no" sería hostil; esto la deja funcionar.
//
// El parche solo cambia el comportamiento en el caso que HOY lanza una excepción:
// nada de lo que funciona pasa por él. Se deja un console.warn para no enmascarar
// en silencio un bug real nuestro.
import { useEffect } from "react";

let instalado = false;

export function DomResiliente() {
  useEffect(() => {
    if (instalado || typeof Node === "undefined") return;
    instalado = true;

    const removeChildOriginal = Node.prototype.removeChild;
    Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
      if (child.parentNode !== this) {
        console.warn("[dom] removeChild ignorado: el nodo ya no es hijo (¿traductor del navegador?)");
        return child;
      }
      return removeChildOriginal.call(this, child) as T;
    };

    const insertBeforeOriginal = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function <T extends Node>(this: Node, nuevo: T, referencia: Node | null): T {
      if (referencia && referencia.parentNode !== this) {
        console.warn("[dom] insertBefore sin referencia válida: se añade al final (¿traductor del navegador?)");
        return this.appendChild(nuevo) as T;
      }
      return insertBeforeOriginal.call(this, nuevo, referencia) as T;
    };
  }, []);

  return null;
}
