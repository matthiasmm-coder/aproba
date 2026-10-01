"use client";

import { useT } from "@/components/lang-provider";
import { UGE, TASA_TIE, tasa038De } from "@/lib/ley14";
import { eur } from "@/lib/facturas";

// PRESENTAR EN LA UGE-CE (01/10/2026) — en un expediente de la Ley 14/2013 sustituye a
// «Presentar en Mercurio»: este circuito no pasa por la Oficina de Extranjería. Lo que se
// automatiza (modelos MI, suplido de la tasa, caducidad y renovación) ya lo hace la ficha;
// aquí, el camino hasta la sede del Ministerio, en orden y con sus enlaces oficiales.
// Fuentes: Ley 14/2013 (arts. 62, 75, 76), sede.inclusion.gob.es y portal de la UGE-CE.
export function PresentarUGE({ expedienteId, servicioClave, servicioLabel }: { expedienteId: string; servicioClave: string | null; servicioLabel?: string | null }) {
  const t = useT();
  const tasa = tasa038De(servicioClave, servicioLabel);
  const pasos: { titulo: string; texto: string; enlaces?: { href: string; label: string; externo?: boolean }[] }[] = [
    {
      titulo: t("Genera los modelos MI"),
      texto: t("MI-T del titular y MI-F de cada familiar. Los firma quien solicita: la empresa en un traslado o un profesional cualificado, el propio interesado en el resto. Tú figuras como persona autorizada a presentar."),
      enlaces: [{ href: `/app/expedientes/${expedienteId}/formularios`, label: t("Abrir los formularios") }],
    },
    {
      titulo: t("Paga la tasa 790-038"),
      texto: `${t("Una por persona, el titular y cada familiar")}${tasa ? `: ${eur(tasa.importe)}` : ""}. ${t("El impreso se obtiene en la sede del Ministerio con certificado digital o Cl@ve.")}`,
      enlaces: [{ href: UGE.tasa038, label: t("Tasa 790-038 en la sede"), externo: true }],
    },
    {
      titulo: t("Presenta en la aplicación de la UGE-CE"),
      texto: t("Con tu certificado: la solicitud, los modelos MI firmados, la tasa pagada y los documentos. Si el titular está fuera de España, la UGE-CE resuelve y después se pide el visado en el consulado; el teletrabajador que está fuera pide directamente el visado."),
      enlaces: [
        { href: UGE.aplicacion, label: t("Abrir la aplicación de la UGE-CE"), externo: true },
        { href: UGE.presentacion, label: t("Cómo se presenta"), externo: true },
      ],
    },
    {
      titulo: t("Anota el número y espera la resolución"),
      texto: t("Guarda el nº de expediente y archiva el expediente «En trámite». La UGE-CE resuelve en 20 días y, si no contesta, se entiende concedida (silencio positivo). Un requerimiento se contesta en 10 días, en la misma aplicación."),
    },
    {
      titulo: t("Concedida: la TIE"),
      texto: `${t("En el mes siguiente, cita de huellas en la Policía con la resolución, el MI-TIE y la tasa 790-012")} (${eur(TASA_TIE.inicial)}).`,
    },
  ];
  return (
    <div>
      <p className="text-sm text-slate-600">{t("Este expediente es de la Ley 14/2013: se presenta ante la Unidad de Grandes Empresas y Colectivos Estratégicos (UGE-CE) del Ministerio de Inclusión, no en Mercurio.")}</p>
      <ol className="mt-4 space-y-3.5">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aproba-50 font-mono text-xs font-semibold text-aproba-700">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{p.titulo}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{p.texto}</p>
              {p.enlaces && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {p.enlaces.map((e) => (
                    <a key={e.href} href={e.href} {...(e.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-aproba-700 hover:underline">
                      {e.label}{e.externo ? " ↗" : " →"}
                    </a>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
