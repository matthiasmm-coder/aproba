import Link from "next/link";
import { variacion, pct, type Estadisticas, type Periodo, type Ranking } from "@/lib/estadisticas-facturacion";
import { eur } from "@/lib/facturas";
import { GraficoMensual, GraficoAcumulado } from "@/components/estadisticas-graficos";

// Pantalla de Facturas › Estadísticas (componente de servidor): recibe las cifras ya
// calculadas y el traductor t() de lib/app-lang (se lo pasa la página; la mención de
// «app-lang» mete este fichero en el perímetro de i18n-cobertura). Aquí solo se pinta.

type Tono = "normal" | "bueno" | "malo" | "aviso";

function Tarjeta({ label, valor, sub, delta, tono = "normal", deltaInverso = false, vsLabel }: {
  label: string; valor: string; sub?: React.ReactNode; delta?: number | null; tono?: Tono; deltaInverso?: boolean; vsLabel?: string;
}) {
  const color = tono === "bueno" ? "text-aproba-700" : tono === "malo" ? "text-red-600" : tono === "aviso" ? "text-amber-600" : "text-slate-900";
  // Subir es bueno en ingresos y resultado; en gastos, lo bueno es bajar.
  const favorable = delta != null && (deltaInverso ? delta < 0 : delta > 0);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${color}`}>{valor}</p>
      {delta != null && (
        <p className={`mt-0.5 text-xs font-semibold tabular-nums ${delta === 0 ? "text-slate-400" : favorable ? "text-aproba-700" : "text-amber-600"}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {pct(Math.abs(delta))} <span className="font-normal text-slate-400">{vsLabel}</span>
        </p>
      )}
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Top({ titulo, filas, vacio, t }: { titulo: string; filas: Ranking[]; vacio: string; t: (s: string) => string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</p>
      {filas.length === 0 ? <p className="mt-2 text-sm text-slate-400">{vacio}</p> : (
        <ol className="mt-2 space-y-2.5">
          {filas.map((f) => (
            <li key={f.nombre}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-700">{f.nombre}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{eur(f.total)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-aproba-500" style={{ width: `${Math.max(2, Math.round(f.cuota * 100))}%` }} />
                </div>
                <span className="shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-slate-400">{pct(f.cuota)} · {f.n} {f.n === 1 ? t("factura") : t("facturas")}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function EstadisticasVista({ est, periodo, sinFechaRecibidas = 0, error = null, t }: {
  est: Estadisticas; periodo: Periodo; sinFechaRecibidas?: number; error?: string | null; t: (s: string) => string;
}) {
  const r = est.resumen;
  const a = est.anterior;
  const href = (anio: number, tri: number) => `/app/facturas/estadisticas?anio=${anio}${tri ? `&t=${tri}` : ""}`;
  const qExport = `anio=${periodo.anio}${periodo.trimestre ? `&t=${periodo.trimestre}` : ""}`;
  const resaltar = periodo.trimestre ? [1, 2, 3].map((k) => (periodo.trimestre - 1) * 3 + k) : [];
  const vs = `${t("vs")} ${periodo.anio - 1}`;
  const etiquetaPeriodo = periodo.trimestre ? `${t("Trimestre")} ${periodo.trimestre} · ${periodo.anio}` : `${t("Año")} ${periodo.anio}`;
  const pastilla = (activo: boolean) => `inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition ${activo ? "bg-aproba-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`;
  const totalAnio = est.trimestres.reduce((acc, q) => ({
    ingresos: acc.ingresos + q.ingresos.base, ivaR: acc.ivaR + q.ingresos.iva, gastos: acc.gastos + q.gastos.base,
    ivaS: acc.ivaS + q.gastos.iva, ret: acc.ret + q.gastos.retenciones, ivaNeto: acc.ivaNeto + q.ivaNeto, resultado: acc.resultado + q.resultado,
  }), { ingresos: 0, ivaR: 0, gastos: 0, ivaS: 0, ret: 0, ivaNeto: 0, resultado: 0 });
  const redondo = (n: number) => Math.round(n * 100) / 100;
  const ivaTexto = (n: number) => (n >= 0 ? `${eur(n)}` : `${eur(Math.abs(n))} ${t("a compensar")}`);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Facturas")}</h1>
          <p className="text-sm text-slate-500">{t("Tu facturación de un vistazo: lo emitido frente a lo recibido, mes a mes y por trimestre.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/facturas/estadisticas/informe?${qExport}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {t("Informe PDF")}
          </a>
          <a href={`/api/facturas/estadisticas/excel?${qExport}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {t("Excel")}
          </a>
        </div>
      </div>

      {/* Emitidas / Recibidas / Estadísticas */}
      <div className="mb-4 inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
        <Link href="/app/facturas" className={pastilla(false)}>{t("Emitidas")}</Link>
        <Link href="/app/facturas?vista=recibidas" className={pastilla(false)}>{t("Recibidas")}</Link>
        <span aria-current="page" className={pastilla(true)}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>
          {t("Estadísticas")}
        </span>
      </div>

      {/* Periodo: año + trimestre */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {est.anios.map((y) => (
            <Link key={y} href={href(y, periodo.trimestre)} aria-current={y === periodo.anio ? "true" : undefined}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${y === periodo.anio ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{y}</Link>
          ))}
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {[0, 1, 2, 3, 4].map((q) => (
            <Link key={q} href={href(periodo.anio, q)} aria-current={q === periodo.trimestre ? "true" : undefined}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${q === periodo.trimestre ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {q === 0 ? t("Año completo") : `T${q}`}
            </Link>
          ))}
        </div>
        <span className="text-sm text-slate-400">{etiquetaPeriodo}</span>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t("No se pudieron cargar las cifras")}: {error}</p>}

      {/* Cifras del periodo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta label={t("Ingresos")} valor={eur(r.ingresos.base)} delta={a ? variacion(r.ingresos.base, a.ingresos.base) : null} vsLabel={vs}
          sub={<>{t("Sin IVA")} · {r.ingresos.n} {r.ingresos.n === 1 ? t("factura") : t("facturas")}
            {r.ingresos.sinDesglose > 0 && <span className="block text-aproba-700">+ {eur(r.ingresos.sinDesgloseTotal)} {t("importados con IVA, sin desglose")}</span>}</>} />
        <Tarjeta label={t("Gastos")} valor={eur(r.gastos.base)} delta={a ? variacion(r.gastos.base, a.gastos.base) : null} deltaInverso vsLabel={vs}
          sub={<>{t("Sin IVA")} · {r.gastos.n} {r.gastos.n === 1 ? t("factura") : t("facturas")}</>} />
        <Tarjeta label={t("Resultado")} valor={eur(r.resultado)} tono={r.resultado < 0 ? "malo" : r.resultado > 0 ? "bueno" : "normal"}
          delta={a ? variacion(r.resultado, a.resultado) : null} vsLabel={vs}
          sub={r.margen != null ? <>{t("Margen")} {pct(r.margen)}</> : t("Ingresos menos gastos")} />
        <Tarjeta label={r.ivaNeto >= 0 ? t("IVA a ingresar (estimado)") : t("IVA a compensar (estimado)")} valor={eur(Math.abs(r.ivaNeto))}
          sub={<>{t("Repercutido")} {eur(r.ingresos.iva)} − {t("soportado")} {eur(r.gastos.iva)}</>} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tarjeta label={t("Pendiente de cobro")} valor={eur(r.ingresos.pendiente)} tono={r.ingresos.pendiente > 0 ? "aviso" : "normal"}
          sub={<>{t("Cobrado")} {eur(r.ingresos.cobrado)} {t("de")} {eur(r.ingresos.total)} {t("facturados con IVA")}</>} />
        <Tarjeta label={t("Pendiente de pago")} valor={eur(r.gastos.pendiente)}
          sub={<>{t("Pagado")} {eur(r.gastos.pagado)} {t("a proveedores")}</>} />
        <Tarjeta label={t("Retenciones practicadas")} valor={eur(r.gastos.retenciones)}
          sub={t("IRPF retenido a tus proveedores: se ingresa en Hacienda (modelos 111 y 115).")} />
      </div>

      {/* Curvas */}
      <div className="mt-4 grid grid-cols-1 gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">{t("Ingresos y gastos por mes")} · {periodo.anio}</h2>
          <GraficoMensual meses={est.meses} anio={periodo.anio} resaltar={resaltar} />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">{t("Acumulado del año")} · {periodo.anio}</h2>
          <GraficoAcumulado meses={est.meses} anio={periodo.anio} />
        </section>
      </div>

      {/* Por trimestre: la hoja «Resumen Trimestres» */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <h2 className="px-5 pb-2 pt-4 text-sm font-semibold text-slate-800">{t("Por trimestre")} · {periodo.anio}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] whitespace-nowrap text-sm tabular-nums">
            <thead>
              <tr className="border-y border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-semibold">{t("Trimestre")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Ingresos")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("IVA repercutido")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Gastos")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("IVA soportado")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Retenciones")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("IVA estimado")}</th>
                <th className="px-5 py-2 text-right font-semibold">{t("Resultado")}</th>
              </tr>
            </thead>
            <tbody>
              {est.trimestres.map((q) => (
                <tr key={q.trimestre} className={`border-b border-slate-50 ${q.trimestre === periodo.trimestre ? "bg-aproba-50/60" : ""}`}>
                  <td className="px-5 py-2.5 font-medium text-slate-700"><Link href={href(periodo.anio, q.trimestre)} className="hover:underline">T{q.trimestre}</Link></td>
                  <td className="px-3 py-2.5 text-right text-slate-800">{eur(q.ingresos.base)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{eur(q.ingresos.iva)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-800">{eur(q.gastos.base)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{eur(q.gastos.iva)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{eur(q.gastos.retenciones)}</td>
                  <td className={`px-3 py-2.5 text-right ${q.ivaNeto < 0 ? "text-aproba-700" : "text-slate-800"}`}>{ivaTexto(q.ivaNeto)}</td>
                  <td className={`px-5 py-2.5 text-right font-semibold ${q.resultado < 0 ? "text-red-600" : "text-slate-900"}`}>{eur(q.resultado)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-5 py-2.5 text-slate-700">{t("Total")} {periodo.anio}</td>
                <td className="px-3 py-2.5 text-right text-slate-900">{eur(redondo(totalAnio.ingresos))}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{eur(redondo(totalAnio.ivaR))}</td>
                <td className="px-3 py-2.5 text-right text-slate-900">{eur(redondo(totalAnio.gastos))}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{eur(redondo(totalAnio.ivaS))}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{eur(redondo(totalAnio.ret))}</td>
                <td className="px-3 py-2.5 text-right text-slate-900">{ivaTexto(redondo(totalAnio.ivaNeto))}</td>
                <td className={`px-5 py-2.5 text-right ${totalAnio.resultado < 0 ? "text-red-600" : "text-slate-900"}`}>{eur(redondo(totalAnio.resultado))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Quién factura y a quién se paga */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Top titulo={`${t("Principales clientes")} · ${etiquetaPeriodo}`} filas={est.topClientes} vacio={t("Sin facturas emitidas en el periodo.")} t={t} />
        <Top titulo={`${t("Principales proveedores")} · ${etiquetaPeriodo}`} filas={est.topProveedores} vacio={t("Sin facturas recibidas en el periodo.")} t={t} />
      </div>

      {/* De dónde salen las cifras */}
      <div className="mt-4 space-y-1 text-xs text-slate-400">
        <p>
          {t("Cifras del periodo: {n} facturas emitidas en Aproba").replace("{n}", String(est.fuentes.aproba))}
          {est.fuentes.anteriores > 0 && <>, {t("{n} anteriores a Aproba (importadas)").replace("{n}", String(est.fuentes.anteriores))}</>}
          {" "}{t("y {n} recibidas.").replace("{n}", String(est.fuentes.recibidas))}
          {" "}{t("Ingresos y gastos van sin IVA; los suplidos (tasas pagadas por cuenta del cliente) no son ingresos.")}
        </p>
        {r.ingresos.sinDesglose > 0 && (
          <p>{t("{n} facturas importadas no traen el desglose de IVA: cuentan en lo facturado con IVA ({importe}), no en los ingresos ni en el IVA.").replace("{n}", String(r.ingresos.sinDesglose)).replace("{importe}", eur(r.ingresos.sinDesgloseTotal))}</p>
        )}
        {r.gastos.sinDesglose > 0 && (
          <p>{t("{n} facturas recibidas sin base imponible leída: revísalas en Recibidas.").replace("{n}", String(r.gastos.sinDesglose))}</p>
        )}
        {r.ingresos.cobroDesconocido > 0 && (
          <p>{t("{importe} importados sin estado del cobro: no cuentan ni como cobrados ni como pendientes.").replace("{importe}", eur(r.ingresos.cobroDesconocido))}</p>
        )}
        {sinFechaRecibidas > 0 && (
          <p>{t("{n} facturas recibidas sin fecha no se cuentan: complétalas en Recibidas.").replace("{n}", String(sinFechaRecibidas))}</p>
        )}
        <p>{t("El IVA y las retenciones son una estimación hecha con las facturas que hay en Aproba: no sustituyen a los modelos 303, 111 o 115.")}</p>
      </div>
    </div>
  );
}
