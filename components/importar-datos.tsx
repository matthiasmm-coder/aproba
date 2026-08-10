"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { TelefonoInput } from "@/components/telefono-input";
import {
  aplicarMapeo, aplicarOverrides, marcarDuplicadosInternos, ESTADOS_EXPEDIENTE,
  type CampoImport, type Mapeo, type OverrideFila, type FilaImportada,
} from "@/lib/importar";

// Asistente de migración: cualquier Excel/CSV (o texto pegado) → la IA propone el mapeo y,
// para CADA trámite, cuánto dura la tarjeta que produce (de ahí sale la renovación) → el
// gestor revisa cliente por cliente, corrige lo que quiera y valida TODO de una vez.

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
  familias: number; serviciosCreados: number; serviciosOmitidos: number;
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
    ["idioma", "Idioma"], ["fechaCaducidad", "Caducidad TIE (→ Vigía)"], ["fechaResolucion", "Fecha del trámite / resolución"],
  ] },
  { grupo: "Servicio realizado", campos: [
    ["tramite", "Trámite / servicio"], ["importe", "Importe cobrado (histórico)"], ["estado", "Estado (resultado)"], ["referencia", "Referencia"], ["notas", "Notas"],
  ] },
  { grupo: "Familia", campos: [["familia", "Familia (agrupación)"], ["parentesco", "Parentesco"]] },
];

// Opciones de validez (meses) de la tarjeta que produce un trámite.
const VALIDEZ_OPCIONES: [number, string][] = [[12, "1 año"], [24, "2 años"], [36, "3 años"], [48, "4 años"], [60, "5 años"]];

const fmtFecha = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export function ImportarDatos() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [texto, setTexto] = useState("");
  const [pegando, setPegando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [mapeo, setMapeo] = useState<(Mapeo & { primeraFilaEsCabecera: boolean }) | null>(null);
  const [overrides, setOverrides] = useState<Record<number, OverrideFila>>({});
  const [paso, setPaso] = useState(1);
  const [ejecutando, setEjecutando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verNotas, setVerNotas] = useState(false);
  const [verAvanzado, setVerAvanzado] = useState(false);
  const [visibles, setVisibles] = useState(20);

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
      setOverrides({});
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
        body: JSON.stringify({ filas: analisis.filas, mapeo, primeraFilaEsCabecera: mapeo.primeraFilaEsCabecera, overrides }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? t("No se pudo importar."));
      setResultado(d);
      setPaso(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo importar."));
    } finally { setEjecutando(false); }
  }

  // Vista previa local con el MISMO motor determinista que ejecuta el servidor
  // (mapeo → duplicados → correcciones del gestor).
  const previa = useMemo(() => {
    if (!analisis || !mapeo || paso !== 3) return null;
    const datos = mapeo.primeraFilaEsCabecera ? analisis.filas.slice(1) : analisis.filas;
    const filas = aplicarMapeo(datos, mapeo);
    marcarDuplicadosInternos(filas);
    aplicarOverrides(filas, overrides);
    const entra = (f: FilaImportada) => !f.excluir && Boolean(f.ficha.nombre?.trim()) && !f.avisos.some((a) => a.startsWith("Duplicado en el archivo"));
    const activas = filas.filter(entra);
    return {
      filas,
      entra,
      clientes: activas.length,
      descartadas: filas.length - activas.length,
      servicios: mapeo.crearHistorial ? activas.filter((f) => f.servicio).length : 0,
      renovaciones: activas.filter((f) => f.fechaCaducidad || f.caducidadDerivada).length,
    };
  }, [analisis, mapeo, paso, overrides]);

  const cabeceras = analisis ? (mapeo?.primeraFilaEsCabecera ? analisis.filas[0] ?? [] : []) : [];
  const primeraFilaDatos = analisis ? (mapeo?.primeraFilaEsCabecera ? analisis.filas[1] : analisis.filas[0]) ?? [] : [];
  const nombreServicio = (clave: string | null) => analisis?.catalogo.find((c) => c.clave === clave)?.nombre ?? clave ?? "—";
  const setOv = (i: number, patch: OverrideFila) => setOverrides((o) => ({ ...o, [i]: { ...o[i], ...patch } }));

  const Chip = ({ n, label }: { n: number; label: string }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
      <p className="text-2xl font-bold tabular-nums text-slate-900">{n}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );

  const nMapeadas = mapeo?.columnas.filter((c) => c.campo).length ?? 0;

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
              className="mt-3 w-full rounded-xl border border-slate-300 p-3 font-mono text-[16px] sm:text-xs outline-none focus:border-aproba-600"
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

      {/* Paso 2 · Qué se importa (lo esencial arriba, el detalle plegado) */}
      {paso === 2 && analisis && mapeo && (
        <div>
          {analisis.hojas.length > 1 && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <span className="text-slate-500">{t("Hoja:")}</span>
              <select value={analisis.hoja} onChange={(e) => analizar(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
                {analisis.hojas.map((h) => <option key={h.nombre} value={h.nombre}>{h.nombre} ({h.filas})</option>)}
              </select>
              {analizando && <span className="text-xs text-slate-400">{t("Analizando…")}</span>}
            </div>
          )}

          <div className="rounded-xl border border-aproba-200 bg-aproba-50 px-4 py-3">
            <p className="text-sm font-semibold text-aproba-800">
              ✓ {t("La IA ha entendido tu archivo")} — {nMapeadas} {t("columnas reconocidas")}
            </p>
            <p className="mt-0.5 text-xs text-aproba-700">{t("Revisa abajo las renovaciones y confirma. Podrás corregir cliente por cliente en el siguiente paso.")}</p>
          </div>

          {/* Lo único que de verdad decide el gestor: qué es cada trámite y cuánto dura */}
          {mapeo.crearHistorial && analisis.valoresTramite.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Tus trámites")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("La renovación de cada cliente sale de aquí: la IA ha deducido cuánto dura la tarjeta que produce cada trámite.")}</p>
              <div className="mt-2 space-y-2">
                {analisis.valoresTramite.map((v) => (
                  <div key={v} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700" title={v}>{v}</span>
                    <select
                      value={mapeo.tramites[v] ?? ""}
                      onChange={(e) => setMapeo({ ...mapeo, tramites: { ...mapeo.tramites, [v]: e.target.value || null } })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600"
                    >
                      <option value="">{t("— Sin servicio del catálogo —")}</option>
                      {analisis.catalogo.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}
                    </select>
                    <span className="text-xs text-slate-400">{t("renueva a los")}</span>
                    <select
                      value={mapeo.validezMeses?.[v] == null ? "" : String(mapeo.validezMeses[v])}
                      onChange={(e) => setMapeo({ ...mapeo, validezMeses: { ...mapeo.validezMeses, [v]: e.target.value ? Number(e.target.value) : null } })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600"
                    >
                      <option value="">{t("No caduca")}</option>
                      {[...VALIDEZ_OPCIONES, ...(mapeo.validezMeses?.[v] && !VALIDEZ_OPCIONES.some(([m]) => m === mapeo.validezMeses[v]) ? [[mapeo.validezMeses[v] as number, `${mapeo.validezMeses[v]} ${t("meses")}`] as [number, string]] : [])]
                        .map(([m, l]) => <option key={m} value={m}>{t(l)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Qué se importa")}</p>
          <div className="mt-2 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={mapeo.crearHistorial} onChange={(e) => setMapeo({ ...mapeo, crearHistorial: e.target.checked })} className="h-4 w-4 accent-aproba-600" />
              {t("Historial de servicios")}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={mapeo.crearFamilias} onChange={(e) => setMapeo({ ...mapeo, crearFamilias: e.target.checked })} className="h-4 w-4 accent-aproba-600" />
              {t("Crear familias")}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={mapeo.primeraFilaEsCabecera} onChange={(e) => setMapeo({ ...mapeo, primeraFilaEsCabecera: e.target.checked })} className="h-4 w-4 accent-aproba-600" />
              {t("La primera fila son títulos")}
            </label>
          </div>

          {/* Detalle: correspondencias de columnas y estados — plegado (rara vez hace falta) */}
          <div className="mt-6">
            <button type="button" onClick={() => setVerAvanzado((v) => !v)} className="text-sm font-medium text-slate-500 hover:text-slate-700">
              {verAvanzado ? "▾ " : "▸ "}{t("Ver las correspondencias de columnas")}
            </button>
            {verAvanzado && (
              <div className="mt-3">
                {analisis.propuesta.notas.length > 0 && (
                  <div className="mb-3 rounded-xl border border-slate-200 bg-cream-50 px-3 py-2.5 text-sm text-slate-700">
                    <button type="button" onClick={() => setVerNotas((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left font-medium">
                      <span>{t("Observaciones de la IA")} · {analisis.propuesta.notas.length}</span>
                      <svg className={`h-4 w-4 shrink-0 transition ${verNotas ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {verNotas && <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs leading-relaxed">{analisis.propuesta.notas.map((n, i) => <p key={i}>· {n}</p>)}</div>}
                  </div>
                )}
                <MapeoColumnas
                  columnas={mapeo.columnas}
                  cabeceras={cabeceras}
                  ejemplos={primeraFilaDatos}
                  t={t}
                  onChange={(indice, campo) => setMapeo({ ...mapeo, columnas: mapeo.columnas.map((x) => x.indice === indice ? { ...x, campo } : x) })}
                />
                {mapeo.crearHistorial && analisis.valoresEstado.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Tus estados → estados de Aproba")}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {analisis.valoresEstado.map((v) => (
                        <div key={v} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-slate-700" title={v}>{v}</span>
                          <span className="text-slate-300">→</span>
                          <select
                            value={mapeo.estados[v] ?? ""}
                            onChange={(e) => setMapeo({ ...mapeo, estados: { ...mapeo.estados, [v]: e.target.value } })}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[16px] sm:text-sm outline-none focus:border-aproba-600"
                          >
                            <option value="">FINALIZADO</option>
                            {ESTADOS_EXPEDIENTE.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button onClick={() => setPaso(1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Atrás")}</button>
            <button onClick={() => { setVisibles(20); setPaso(3); }} className="rounded-lg bg-aproba-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Revisar clientes")}</button>
          </div>
        </div>
      )}

      {/* Paso 3 · Revisión cliente por cliente (editable) */}
      {paso === 3 && analisis && mapeo && previa && (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Chip n={previa.clientes} label={t("clientes")} />
            <Chip n={previa.servicios} label={t("servicios")} />
            <Chip n={previa.renovaciones} label={t("renovaciones → Vigía")} />
            <Chip n={previa.descartadas} label={t("descartadas")} />
          </div>
          {analisis.truncado && <p className="mt-2 text-xs text-amber-600">{t("El archivo supera 1500 filas: se importan las 1500 primeras. Repite con el resto.")}</p>}
          <p className="mt-3 text-sm text-slate-500">{t("Revisa y corrige lo que haga falta. Lo que dejes vacío lo completará el cliente desde su enlace.")}</p>

          <div className="mt-4 space-y-3">
            {previa.filas.slice(0, visibles).map((f, i) => {
              const dup = f.avisos.find((a) => a.startsWith("Duplicado en el archivo"));
              const sinNombre = !f.ficha.nombre?.trim();
              const dentro = previa.entra(f);
              const cad = f.fechaCaducidad || f.caducidadDerivada;
              const fuente = f.fechaCaducidad ? (overrides[i]?.caducidad !== undefined ? t("editada") : t("del archivo")) : f.caducidadDerivada ? t("estimada del servicio") : "";
              return (
                <div key={i} className={`rounded-xl border p-4 ${dentro ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <input
                        value={f.ficha.nombre ?? ""}
                        onChange={(e) => setOv(i, { nombre: e.target.value })}
                        placeholder={t("Nombre")}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[16px] sm:text-sm font-semibold text-slate-800 outline-none focus:border-aproba-600"
                      />
                      <input
                        value={f.ficha.apellidos ?? ""}
                        onChange={(e) => setOv(i, { apellidos: e.target.value })}
                        placeholder={t("Apellidos")}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[16px] sm:text-sm font-semibold text-slate-800 outline-none focus:border-aproba-600"
                      />
                    </div>
                    <button
                      onClick={() => setOv(i, { excluir: !f.excluir })}
                      className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${f.excluir ? "border-aproba-300 text-aproba-700 hover:bg-aproba-50" : "border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-600"}`}
                    >
                      {f.excluir ? t("Recuperar") : t("No importar")}
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {(f.ficha.numeroDocumento || f.ficha.pasaporte) && <span className="font-mono">{f.ficha.numeroDocumento ?? f.ficha.pasaporte}</span>}
                    {f.ficha.nacionalidad && <span>{f.ficha.nacionalidad}</span>}
                    {f.ficha.fechaNacimiento && <span>{t("nac.")} {fmtFecha(f.ficha.fechaNacimiento)}</span>}
                    {f.familia && <span className="rounded-full bg-slate-100 px-2 py-0.5">{f.familia}{f.parentesco ? ` · ${f.parentesco.toLowerCase()}` : ""}</span>}
                    {dup && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">{t("duplicado — no se importa")}</span>}
                    {sinNombre && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{t("sin nombre — no se importa")}</span>}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <TelefonoInput
                      value={f.ficha.telefono ?? ""}
                      onChange={(v) => setOv(i, { telefono: v })}
                      placeholder={t("Teléfono")}
                      labelPrefijo={t("Prefijo de país")}
                      labelSinPrefijo={t("— Sin prefijo")}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-aproba-600"
                    />
                    <input
                      value={f.ficha.email ?? ""}
                      onChange={(e) => setOv(i, { email: e.target.value })}
                      placeholder={t("Email")}
                      inputMode="email"
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[16px] sm:text-sm text-slate-700 outline-none focus:border-aproba-600"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="min-w-0 text-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t("Servicio realizado")}</p>
                      <p className="truncate text-slate-700">
                        {f.servicio ? nombreServicio(f.servicio) : (f.tramite || "—")}
                        {f.fechaResolucion && <span className="text-slate-400"> · {fmtFecha(f.fechaResolucion)}</span>}
                        {f.importe != null && <span className="font-medium text-slate-600"> · {f.importe} €</span>}
                        {!f.servicio && f.tramite && <span className="text-amber-600"> · {t("sin servicio del catálogo")}</span>}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t("Renovación (Vigía)")}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <input
                          type="date"
                          value={cad}
                          onChange={(e) => setOv(i, { caducidad: e.target.value })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[16px] sm:text-sm text-slate-700 outline-none focus:border-aproba-600"
                        />
                        {fuente && <span className="text-xs text-slate-400">{fuente}</span>}
                      </div>
                    </div>
                  </div>

                  {f.avisos.filter((a) => !a.startsWith("Duplicado en el archivo") && a !== "Fila sin nombre").length > 0 && (
                    <p className="mt-2 text-xs text-amber-600">{f.avisos.filter((a) => !a.startsWith("Duplicado en el archivo") && a !== "Fila sin nombre").join(" · ")}</p>
                  )}
                </div>
              );
            })}
          </div>

          {previa.filas.length > visibles && (
            <button onClick={() => setVisibles((v) => v + 20)} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
              {t("Mostrar más")} ({previa.filas.length - visibles})
            </button>
          )}

          <p className="mt-4 text-xs text-slate-400">{t("Reimportar el mismo archivo no crea duplicados, y los servicios migrados no consumen tu cuota mensual.")}</p>

          <div className="sticky bottom-0 mt-4 flex gap-3 border-t border-slate-200 bg-cream-50/95 py-3 backdrop-blur">
            <button onClick={() => setPaso(2)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Atrás")}</button>
            <button onClick={ejecutar} disabled={ejecutando || previa.clientes === 0} className="flex-1 rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
              {ejecutando ? t("Importando…") : `${t("Importar")} ${previa.clientes} ${previa.clientes === 1 ? t("cliente") : t("clientes")}`}
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
            <Chip n={resultado.serviciosCreados} label={t("servicios (histórico)")} />
            <Chip n={resultado.vencimientos} label={t("vencimientos Vigía")} />
          </div>
          {(resultado.familias > 0 || resultado.serviciosOmitidos > 0 || resultado.clientesOmitidos > 0) && (
            <p className="mt-3 text-sm text-slate-500">
              {resultado.familias > 0 && `${resultado.familias} ${t("familias")} · `}
              {resultado.clientesOmitidos > 0 && `${resultado.clientesOmitidos} ${t("clientes omitidos (duplicados)")} · `}
              {resultado.serviciosOmitidos > 0 && `${resultado.serviciosOmitidos} ${t("servicios ya en el historial")}`}
            </p>
          )}
          {resultado.avisos.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <ul className="space-y-0.5 text-xs text-amber-700">{resultado.avisos.map((a, i) => <li key={i}>· {a}</li>)}</ul>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app/clientes" className="rounded-lg bg-aproba-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Ver clientes")}</Link>
            <Link href="/app/vencimientos" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Ver Vigía (renovaciones)")}</Link>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// Mapeo de columnas → campos: arriba las RECONOCIDAS, plegadas abajo las ignoradas
// (basura del export). Todas siguen siendo editables — el poder está, pero sin abrumar.
function MapeoColumnas({ columnas, cabeceras, ejemplos, t, onChange }: {
  columnas: Mapeo["columnas"];
  cabeceras: string[];
  ejemplos: string[];
  t: (s: string) => string;
  onChange: (indice: number, campo: CampoImport | null) => void;
}) {
  const [verIgnoradas, setVerIgnoradas] = useState(false);
  const mapeadas = columnas.filter((c) => c.campo);
  const ignoradas = columnas.filter((c) => !c.campo);
  const nombreCol = (c: Mapeo["columnas"][number]) => cabeceras[c.indice]?.trim() || `${t("Columna")} ${c.indice + 1}`;
  const fila = (c: Mapeo["columnas"][number]) => (
    <tr key={c.indice} className="border-b border-slate-50 last:border-0">
      <td className="px-3 py-2 font-medium text-slate-700">{nombreCol(c)}</td>
      <td className="max-w-[180px] truncate px-3 py-2 text-slate-400">{ejemplos[c.indice] ?? ""}</td>
      <td className="px-3 py-2">
        <select
          value={c.campo ?? ""}
          onChange={(e) => onChange(c.indice, (e.target.value || null) as CampoImport | null)}
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600"
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
  );
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">{t("Columna del archivo")}</th>
              <th className="px-3 py-2">{t("Ejemplo")}</th>
              <th className="px-3 py-2">{t("Campo en Aproba")}</th>
            </tr>
          </thead>
          <tbody>{mapeadas.map(fila)}</tbody>
        </table>
      </div>
      {ignoradas.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setVerIgnoradas((v) => !v)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
            {verIgnoradas ? "▾ " : "▸ "}{ignoradas.length} {t("columnas sin usar")}
            <span className="font-normal text-slate-400"> · {ignoradas.map(nombreCol).join(", ")}</span>
          </button>
          {verIgnoradas && (
            <div className="mt-2 overflow-x-auto rounded-xl border border-dashed border-slate-200 bg-white">
              <table className="w-full text-sm"><tbody>{ignoradas.map(fila)}</tbody></table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
