"use client";

import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, type ClienteFicha } from "@/lib/ficha";
import { TelefonoInput } from "@/components/telefono-input";
import { FechaInput } from "@/components/fecha-input";
import { fieldLabel, grupoLabel, sexoLabel, estadoCivilLabel, type Lang } from "@/lib/portal-i18n";

// Rejilla de la FICHA de una persona en el portal (grupos × campos, con teléfono con
// prefijo, selects de sexo/estado civil y fecha). Misma rejilla que la ficha individual y
// la de cada miembro de la familia; aquí extraída para el trabajador de una empresa.
export function FichaCamposPortal({ ficha, lang, onChange, t }: {
  ficha: ClienteFicha;
  lang: Lang;
  onChange: (k: keyof ClienteFicha, v: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <>
      {GRUPOS.map((grupo) => (
        <div key={grupo} className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{grupoLabel(grupo, lang)}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FICHA_CAMPOS.filter((f) => f.grupo === grupo).map((f) => (
              <div key={f.k} className={f.w === "full" ? "sm:col-span-2" : ""}>
                <label className="text-[13px] font-medium text-slate-600">{fieldLabel(f.k, lang)}</label>
                {f.tipo === "tel" ? (
                  <div className="mt-1">
                    <TelefonoInput
                      value={ficha[f.k] ?? ""}
                      onChange={(v) => onChange(f.k, v)}
                      labelPrefijo={t("tel.prefijo")}
                      labelSinPrefijo={t("tel.sinPrefijo")}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-aproba-600 sm:text-sm"
                    />
                  </div>
                ) : f.tipo === "sexo" || f.tipo === "estadoCivil" ? (
                  <select value={ficha[f.k] ?? ""} onChange={(e) => onChange(f.k, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
                    {(f.tipo === "sexo" ? SEXOS : ESTADOS_CIVILES).map(([v]) => <option key={v} value={v}>{f.tipo === "sexo" ? sexoLabel(v, lang) : estadoCivilLabel(v, lang)}</option>)}
                  </select>
                ) : f.tipo === "date" ? (
                  <FechaInput value={ficha[f.k] ?? ""} onChange={(iso: string) => onChange(f.k, iso)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600" />
                ) : (
                  <input type="text" value={ficha[f.k] ?? ""} onChange={(e) => onChange(f.k, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600" />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
