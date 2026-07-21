"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { aplicarMapeo, marcarDuplicadosInternos, TODOS_LOS_CAMPOS, ESTADOS_EXPEDIENTE, type CampoImport, type Mapeo } from "@/lib/importar";

// Asistente de migración: cualquier Excel/CSV (o texto pegado) → la IA propone el
// mapeo → el gestor lo valida → import idempotente. Las 4 realidades del mercado
// (Excel casero, exports de MN Program/Sudespacho, listas) entran por AQUÍ.

type Analisis = {
  hojas: { nombre: string; filas: number }[];
  hoja: string;
  truncado: boolean;
  filas: string[][];
  catalogo: { clave: string; nombre: string }[];
  propuesta: Mapeo & { primeraFilaEsCabecera: boolean; notas: string[] };
  valoresTramite: string[];
  valoresEstado: string[];
};

type Resultado = {
  clientesCreados: number; clientesActualizados: number; clientesOmitidos: number;
  familias: number; expedientesCreados: number; expedientesOmitidos: number;
  vencimientos: number; avisos: string[];
};

// Etiquetas de los campos de destino (agrupadas para el select).
const GRUPOS: { grupo: string; campos: [CampoImport, string][] }[] = [
  { grupo: "Cliente", campos: [
    ["nombreCompleto", "Nombre completo (una sola columna)"], ["nombre", "Nombre"], ["apellidos", "Apellidos"],
    ["documento", "NIE o pasaporte (mezclados)"], ["numeroDocumento", "NIE / DNI"], ["pasaporte", "Pasaporte"],
    ["telefono", "Teléfono"], ["email", "Email"], ["fechaNacimiento", "Fecha de nacimiento"],
    ["nacionalidad", "Nacionalidad"], ["sexo", "Sexo"], ["estadoCivil", "Estado civil"],
    ["lugarNacimiento", "Lugar de nacimiento"], ["paisNacimiento", "País de nacimiento"],
    ["nombrePadre", "Nombre del padre"], ["nombreMadre", "Nombre de la madre"],
    ["via", "Domicilio (calle)"], ["numeroVia", "Número"], ["piso", "Piso / puerta"],
    ["codigoPostal", "Código postal"], ["municipio", "Municipio"], ["provincia", "Provincia"],
    ["idioma", "Idioma"], ["fechaCaducidad", "Caducidad TIE (→ Vigía)"], ["fechaResolucion", "Fecha de resolución (regularización)"],
  ] },
  { grupo: "Expediente", campos: [
    ["tramite", "Trámite"], ["estado", "Estado"], ["referencia", "Referencia"], ["notas", "Notas"],
  ] },
  { grupo: "Familia", campos: [["familia", "Familia (agrupación)"], ["parentesco", "Parentesco"]] },
];

export function ImportarDatos() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [texto, setTexto] = useState("");
  const [pegando, setPegando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [mapeo, setMapeo] = useState<(Mapeo & { primeraFilaEsCabecera: boolean }) | null>(null);
  const [paso, setPaso] = useState(1);
  const [ejecutando, setEjecutando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analizar(hoja?: string) {
    if (!archivo && !texto.trim()) return;
    setAnalizando(true); setError(null);
    try {
      const fd = new FormData();
      if (archivo) fd.set("file", archivo);
      else fd.set("texto", texto);
      if (hoja) fd.set("hoja", hoja);
      const res = await fetch("/api/importar/analizar", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? t("No se pudo analizar el archivo."));
      setAnalisis(d);
      setMapeo({ ...d.propuesta });
      setPaso(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo analizar el archivo."));
    } finally { setAnalizando(false); }
  }

  async function ejecutar() {
    if (!analisis || !mapeo) return;
    setEjecutando(true); setError(null);
    try {
      const res = await fetch("/api/importar/ejecutar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas: analisis.filas, mapeo, primeraFilaEsCabecera: mapeo.primeraFilaEsCabecera }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? t("No se pudo importar."));
      setResultado(d);
      setPaso(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo importar."));
    } finally { setEjecutando(false); }
  }

  // Vista previa local con el MISMO motor determinista que ejecuta el servidor.
  const previa = useMemo(() => {
    if (!analisis || !mapeo || paso !== 3) return null;
    const datos = mapeo.primeraFilaEsCabecera ? analisis.filas.slice(1) : analisis.filas;
    const filas = aplicarMapeo(datos, mapeo);
    marcarDuplicadosInternos(filas);
    const conAviso = filas.filter((f) => f.avisos.length);
    return { filas, total: filas.length, conAviso, expedientes: filas.filter((f) => f.servicio).length, caducidades: filas.filter((f) => f.fechaCaducidad).length };
  }, [analisis, mapeo, paso]);

  const cabeceras = analisis ? (mapeo?.primeraFilaEsCabecera ? analisis.filas[0] ?? [] : []) : [];
  const primeraFilaDatos = analisis ? (mapeo?.primeraFilaEsCabecera ? analisis.filas[1] : analisis.filas[0]) ?? [] : [];
  const nombreServicio = (clave: string | null) => analisis?.catalogo.find((c) => c.clave === clave)?.nombre ?? clave ?? "—";

  const Chip = ({ n, label }: { n: number; label: string }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
      <p className="text-2xl font-bold tabular-nums text-slate-900">{n}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );

  return (
    <div className="max-w-4xl">
      {/* Paso 1 · Archivo */}
      {paso === 1 && (
        <div>
          <div
            className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition hover:border-aproba-400"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setArchivo(f); setTexto(""); setPegando(false); } }}
          >
            <svg className="mx-auto h-10 w-10 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
            <p className="mt-3 text-sm font-semibold text-slate-800">{archivo ? archivo.name : t("Arrastra tu Excel o CSV aquí")}</p>
            <p className="mt-1 text-xs text-slate-400">{t("Tal cual está: la IA entiende tus columnas, no hace falta reordenar nada.")}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setArchivo(f); setTexto(""); setPegando(false); } e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Elegir archivo")}</button>
              <button onClick={() => { setPegando((v) => !v); setArchivo(null); }} className="text-sm font-medium text-aproba-700 hover:underline">{t("o pega los datos")}</button>
            </div>
          </div>
          {pegando && (
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              placeholder={t("Pega aquí las filas copiadas de tu Excel o programa…")}
              className="mt-3 w-full rounded-xl border border-slate-300 p-3 font-mono text-xs outline-none focus:border-aproba-600"
            />
          )}

          <button
            onClick={() => analizar()}
            disabled={analizando || (!archivo && !texto.trim())}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
          >
            {analizando ? t("Analizando…") : t("Analizar con IA")}
          </button>

          <div className="mt-8 rounded-xl border border-slate-200 bg-cream-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("¿Cómo saco los datos de mi programa?")}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
              <li><span className="font-semibold">MN Program:</span> {t("Informes → el listado de clientes o expedientes → Exportar a Excel.")}</li>
              <li><span className="font-semibold">Sudespacho:</span> {t("Informes personalizados → Exportar (Excel) y sube el archivo tal cual.")}</li>
              <li><span className="font-semibold">Excel / Google Sheets:</span> {t("Sube el archivo directamente, con tus columnas de siempre.")}</li>
              <li><span className="font-semibold">{t("Papel o PDF:")}</span> {t("Cópialo a una hoja rápida (aunque sea desordenada) y pégala aquí.")}</li>
            </ul>
          </div>
        </div>
      )}

      {/* Paso 2 · Mapeo */}
      {paso === 2 && analisis && mapeo && (
        <div>
          {analisis.hojas.length > 1 && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <span className="text-slate-500">{t("Hoja:")}</span>
              <select value={analisis.hoja} onChange={(e) => analizar(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-aproba-600">
                {analisis.hojas.map((h) => <option key={h.nombre} value={h.nombre}>{h.nombre} ({h.filas})</option>)}
              </select>
              {analizando && <span className="text-xs text-slate-400">{t("Analizando…")}</span>}
            </div>
          )}
          {analisis.propuesta.notas.length > 0 && (
            <div className="mb-4 rounded-xl border border-aproba-200 bg-aproba-50 p-3 text-sm text-aproba-800">
              {analisis.propuesta.notas.map((n, i) => <p key={i}>· {n}</p>)}
            </div>
          )}

          <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={mapeo.primeraFilaEsCabecera} onChange={(e) => setMapeo({ ...mapeo, primeraFilaEsCabecera: e.target.checked })} className="h-4 w-4 accent-aproba-600" />
            {t("La primera fila son títulos de columna")}
          </label>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">{t("Columna del archivo")}</th>
                  <th className="px-3 py-2">{t("Ejemplo")}</th>
                  <th className="px-3 py-2">{t("Campo en Aproba")}</th>
                </tr>
              </thead>
              <tbody>
                {mapeo.columnas.map((c) => (
                  <tr key={c.indice} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-700">{cabeceras[c.indice]?.trim() || `${t("Columna")} ${c.indice + 1}`}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-slate-400">{primeraFilaDatos[c.indice] ?? ""}</td>
                    <td className="px-3 py-2">
                      <select
                        value={c.campo ?? ""}
                        onChange={(e) => setMapeo({ ...mapeo, columnas: mapeo.columnas.map((x) => x.indice === c.indice ? { ...x, campo: (e.target.value || null) as CampoImport | null } : x) })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-aproba-600"
                      >
                        <option value="">{t("— Ignorar —")}</option>
                        {GRUPOS.map((g) => (
                          <optgroup key={g.grupo} label={g.grupo}>
                            {g.campos.map(([campo, label]) => <option key={campo} value={campo}>{label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={mapeo.crearExpedientes} onChange={(e) => setMapeo({ ...mapeo, crearExpedientes: e.target.checked })} className="h-4 w-4 accent-aproba-600" />
              {t("Crear expedientes (histórico)")}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={mapeo.crearFamilias} onChange={(e) => setMapeo({ ...mapeo, crearFamilias: e.target.checked })} className="h-4 w-4 accent-aproba-600" />
              {t("Crear familias")}
            </label>
          </div>

          {/* Regularización extraordinaria 2026: la autorización dura 1 año → la caducidad
              (y el aviso de renovación) sale de la fecha de resolución. */}
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-aproba-200 bg-aproba-50 p-3 text-sm text-aproba-800">
            <input type="checkbox" checked={Boolean(mapeo.regularizacion2026)} onChange={(e) => setMapeo({ ...mapeo, regularizacion2026: e.target.checked })} className="mt-0.5 h-4 w-4 accent-aproba-600" />
            <span>
              <span className="font-semibold">{t("Son expedientes de la regularización extraordinaria 2026")}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-aproba-700">{t("La autorización dura un año: calculamos la caducidad desde la fecha de resolución y Vigía te avisa de cada renovación.")}</span>
            </span>
          </label>

          {mapeo.crearExpedientes && analisis.valoresTramite.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Tus trámites → tus servicios")}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {analisis.valoresTramite.map((v) => (
                  <div key={v} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={v}>{v}</span>
                    <span className="text-slate-300">→</span>
                    <select
                      value={mapeo.tramites[v] ?? ""}
                      onChange={(e) => setMapeo({ ...mapeo, tramites: { ...mapeo.tramites, [v]: e.target.value || null } })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-aproba-600"
                    >
                      <option value="">{t("— Sin expediente —")}</option>
                      {analisis.catalogo.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mapeo.crearExpedientes && analisis.valoresEstado.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Tus estados → estados de Aproba")}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {analisis.valoresEstado.map((v) => (
                  <div key={v} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={v}>{v}</span>
                    <span className="text-slate-300">→</span>
                    <select
                      value={mapeo.estados[v] ?? ""}
                      onChange={(e) => setMapeo({ ...mapeo, estados: { ...mapeo.estados, [v]: e.target.value } })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-aproba-600"
                    >
                      <option value="">FINALIZADO</option>
                      {ESTADOS_EXPEDIENTE.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={() => setPaso(1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Atrás")}</button>
            <button onClick={() => setPaso(3)} className="rounded-lg bg-aproba-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Revisar antes de importar")}</button>
          </div>
        </div>
      )}

      {/* Paso 3 · Revisión */}
      {paso === 3 && analisis && mapeo && previa && (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Chip n={previa.total} label={t("filas")} />
            <Chip n={mapeo.crearExpedientes ? previa.expedientes : 0} label={t("expedientes")} />
            <Chip n={previa.caducidades} label={t("caducidades → Vigía")} />
            <Chip n={previa.conAviso.length} label={t("con avisos")} />
          </div>
          {analisis.truncado && <p className="mt-2 text-xs text-amber-600">{t("El archivo supera 1500 filas: se importan las 1500 primeras. Repite con el resto.")}</p>}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">{t("Nombre")}</th>
                  <th className="px-3 py-2">{t("Documento")}</th>
                  <th className="px-3 py-2">{t("Teléfono")}</th>
                  <th className="px-3 py-2">{t("Trámite")}</th>
                  <th className="px-3 py-2">{t("Caducidad")}</th>
                  <th className="px-3 py-2">{t("Familia")}</th>
                </tr>
              </thead>
              <tbody>
                {previa.filas.slice(0, 8).map((f, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-700">{`${f.ficha.nombre ?? ""} ${f.ficha.apellidos ?? ""}`.trim() || "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{f.ficha.numeroDocumento ?? f.ficha.pasaporte ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{f.ficha.telefono ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{mapeo.crearExpedientes && f.servicio ? `${nombreServicio(f.servicio)} · ${f.estado}` : "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{f.fechaCaducidad || "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{f.familia || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previa.conAviso.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-800">{t("Avisos (las filas se importan igualmente):")}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                {previa.conAviso.slice(0, 10).map((f, i) => <li key={i}>· {`${f.ficha.nombre ?? ""} ${f.ficha.apellidos ?? ""}`.trim() || t("(sin nombre)")}: {f.avisos.join(" · ")}</li>)}
                {previa.conAviso.length > 10 && <li>{t("… y {n} más").replace("{n}", String(previa.conAviso.length - 10))}</li>}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">{t("Reimportar el mismo archivo no crea duplicados, y los expedientes migrados no consumen tu cuota mensual.")}</p>

          <div className="mt-4 flex gap-3">
            <button onClick={() => setPaso(2)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Atrás")}</button>
            <button onClick={ejecutar} disabled={ejecutando} className="rounded-lg bg-aproba-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
              {ejecutando ? t("Importando…") : t("Importar ahora")}
            </button>
          </div>
        </div>
      )}

      {/* Paso 4 · Resultado */}
      {paso === 4 && resultado && (
        <div>
          <div className="rounded-xl border border-aproba-200 bg-aproba-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-aproba-800">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              {t("Migración completada")}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Chip n={resultado.clientesCreados} label={t("clientes nuevos")} />
            <Chip n={resultado.clientesActualizados} label={t("completados")} />
            <Chip n={resultado.expedientesCreados} label={t("expedientes")} />
            <Chip n={resultado.vencimientos} label={t("vencimientos Vigía")} />
          </div>
          {(resultado.familias > 0 || resultado.expedientesOmitidos > 0 || resultado.clientesOmitidos > 0) && (
            <p className="mt-3 text-sm text-slate-500">
              {resultado.familias > 0 && `${resultado.familias} ${t("familias")} · `}
              {resultado.clientesOmitidos > 0 && `${resultado.clientesOmitidos} ${t("clientes omitidos (duplicados)")} · `}
              {resultado.expedientesOmitidos > 0 && `${resultado.expedientesOmitidos} ${t("expedientes ya existentes")}`}
            </p>
          )}
          {resultado.avisos.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <ul className="space-y-0.5 text-xs text-amber-700">{resultado.avisos.map((a, i) => <li key={i}>· {a}</li>)}</ul>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app/clientes" className="rounded-lg bg-aproba-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Ver clientes")}</Link>
            <Link href="/app/expedientes" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Ver expedientes")}</Link>
            <Link href="/app/vencimientos" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Ver Vigía")}</Link>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
