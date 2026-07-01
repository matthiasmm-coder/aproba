"use client";

import { limiteExpedientes, planLabel, PRECIO_EXPEDIENTE_EXTRA } from "@/lib/planes";
import { useT } from "@/components/lang-provider";

// Contador mensual de expedientes del workspace (visible al crear uno). Muestra usados/límite
// del plan; al alcanzar el límite avisa del coste por expediente extra (3 €), salvo en prueba
// gratuita, donde deja continuar sin coste con un mensaje explicativo.
export function ContadorExpedientes({ usados, plan, enPrueba }: { usados: number; plan: string; enPrueba: boolean }) {
  const t = useT();
  const limite = limiteExpedientes(plan);
  const restantes = limite - usados;
  const enLimite = usados >= limite;              // alcanzado o superado
  const extra = Math.max(0, usados - limite);     // ya creados por encima del límite
  const pct = Math.min(100, Math.round((usados / limite) * 100));

  const barra = !enLimite ? "bg-aproba-600" : enPrueba ? "bg-sky-500" : "bg-amber-500";
  const numero = !enLimite ? "text-slate-900" : enPrueba ? "text-sky-700" : "text-amber-700";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{t("Expedientes este mes")}</p>
        <p className="text-sm text-slate-500">
          <span className={`text-lg font-bold tabular-nums ${numero}`}>{usados}</span>
          <span className="text-slate-400"> / {limite}</span>
          <span className="ml-1.5 text-xs text-slate-400">· {t("plan")} {planLabel(plan)}</span>
        </p>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all duration-500 ${barra}`} style={{ width: `${Math.max(pct, usados > 0 ? 4 : 0)}%` }} />
      </div>

      {!enLimite ? (
        <p className="mt-2 text-xs text-slate-500">
          {restantes === 1
            ? t("Te queda 1 expediente incluido este mes.")
            : `${t("Te quedan")} ${restantes} ${t("expedientes incluidos este mes.")}`}
        </p>
      ) : enPrueba ? (
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
          <p className="font-semibold">{t("Has alcanzado el límite de tu plan")} ({limite}/{t("mes")}).</p>
          <p className="mt-0.5">
            {t("Durante tu prueba gratuita puedes seguir creando expedientes sin coste.")}{" "}
            {t("Normalmente cada expediente por encima del límite cuesta")} {PRECIO_EXPEDIENTE_EXTRA} €, {t("pero no se aplica durante la prueba.")}
          </p>
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <p className="font-semibold">{t("Has alcanzado el límite de tu plan")} ({limite}/{t("mes")}).</p>
          <p className="mt-0.5">
            {extra > 0
              ? `${extra} ${extra === 1 ? t("expediente extra este mes") : t("expedientes extra este mes")} · ${extra * PRECIO_EXPEDIENTE_EXTRA} €.`
              : t("El próximo será el primero por encima del límite.")}{" "}
            {t("Cada expediente adicional se factura a")} {PRECIO_EXPEDIENTE_EXTRA} € ({t("puedes seguir creando")}).
          </p>
        </div>
      )}
    </div>
  );
}
