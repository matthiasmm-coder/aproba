"use client";

import Link from "next/link";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, type ClienteFicha } from "@/lib/ficha";
import { useT } from "@/components/lang-provider";
import { EditarCliente } from "@/components/editar-cliente";

// Sección «Información» de la ficha del expediente (22/08/2026, pedido de Matthias):
// TODOS los datos personales del cliente, los MISMOS que pide el portal y que se ven en
// el menú «Clientes». Se leen de lib/ficha.ts — fuente única de los campos — así que
// añadir un campo allí lo hace aparecer aquí, en el portal y en Clientes a la vez.
//
// Por qué aquí: el gestor prepara los formularios desde el expediente y necesita ver
// (y corregir) los datos sin saltar a otra pantalla; antes solo veía la lista de lo que
// FALTABA, en un aviso, y tenía que irse a la ficha del cliente para leer lo que había.

const fmtFecha = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

function valorLegible(k: keyof ClienteFicha, v: string, t: (s: string) => string): string {
  if (!v) return "";
  if (k === "sexo") return t(String(SEXOS.find(([c]) => c === v)?.[1] ?? v));
  if (k === "estadoCivil") return t(String(ESTADOS_CIVILES.find(([c]) => c === v)?.[1] ?? v));
  if (k === "fechaNacimiento") return fmtFecha(v);
  return v;
}

export function InformacionCliente({ ficha, clienteId, oficinas = [], oficinaId = null }: {
  ficha: ClienteFicha;
  clienteId: string | null;
  oficinas?: { id: string; nombre: string }[];
  oficinaId?: string | null;
}) {
  const t = useT();

  return (
    <div>
      <div className="space-y-5">
        {GRUPOS.map((grupo) => {
          const campos = FICHA_CAMPOS.filter((f) => f.grupo === grupo);
          return (
            <div key={grupo}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t(grupo)}</p>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {campos.map((f) => {
                  const bruto = String(ficha[f.k] ?? "").trim();
                  const valor = valorLegible(f.k, bruto, t);
                  return (
                    <div key={f.k} className="flex items-baseline justify-between gap-3 border-b border-slate-50 py-1">
                      <dt className="shrink-0 text-xs text-slate-500">{t(f.label)}</dt>
                      {/* Un hueco vacío se ve COMO hueco: el gestor está a punto de generar
                          un formulario oficial y necesita distinguirlo de un dato correcto. */}
                      <dd className={`min-w-0 truncate text-right text-sm ${valor ? "font-medium text-slate-800" : "text-amber-600"}`} title={valor || undefined}>
                        {valor || t("sin rellenar")}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </div>

      {clienteId && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-4">
          <EditarCliente clienteId={clienteId} ficha={ficha} oficinas={oficinas} oficinaId={oficinaId} />
          <Link href={`/app/clientes/${clienteId}`} className="text-sm font-semibold text-aproba-700 hover:underline">
            {t("Ver ficha completa del cliente")} →
          </Link>
        </div>
      )}
    </div>
  );
}
