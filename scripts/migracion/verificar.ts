// VERIFICAR una migración (fase 8 de web/MIGRACION.md) — LECTURA SOLA. Cuadra lo que hay en
// Aproba con los TOTALES DE CONTROL del archivo del cliente (perfilar.py --control) y busca lo
// que suele salir mal: homónimos con dos fichas, servicios sin fecha o sin importe, fichas sin
// contacto, empresas sin CIF. Es lo que permite escribirle al cliente «cuadra con tu Excel».
//
//   MIGRA_WS=<despacho> [MIGRA_CONTROL=control.json] scripts/migracion/correr.sh scripts/migracion/verificar.ts
//
// control.json (todas las claves opcionales): { facturas, importeTotal, pendientes,
// importePendiente, personas, empresas } — lo escribe perfilar.py y se corrige a mano si hace falta.

import { readFileSync } from "node:fs";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { claveNombre, chocan } from "@/lib/importar-personas";

type Control = Partial<Record<"facturas" | "importeTotal" | "pendientes" | "importePendiente" | "personas" | "empresas", number>>;

(async () => {
  const ws = process.env.MIGRA_WS ?? "";
  if (!ws) throw new Error("falta MIGRA_WS");
  const control: Control = process.env.MIGRA_CONTROL ? JSON.parse(readFileSync(process.env.MIGRA_CONTROL, "utf8")) : {};
  const a = createSupabaseAdmin();
  const leer = async <T,>(tabla: string, cols: string): Promise<T[]> => {
    const out: T[] = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await a.from(tabla).select(cols).eq("workspaceId", ws).order("id").range(d, d + 999);
      if (error) throw new Error(`${tabla}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if ((data ?? []).length < 1000) return out;
    }
  };
  const { data: w } = await a.from("Workspace").select("nombre").eq("id", ws).single();
  console.log(`Verificación de «${(w as { nombre: string } | null)?.nombre ?? ws}»\n`);

  let fallos = 0;
  const ok = (bien: boolean, msg: string) => { console.log(`  ${bien ? "✓" : "✗"} ${msg}`); if (!bien) fallos++; };
  const info = (msg: string) => console.log(`  · ${msg}`);
  const eur = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const igual = (x: number, y: number) => Math.abs(x - y) < 0.05;

  // ── Clientes ──
  type Cli = { id: string; nombre: string | null; apellidos: string | null; numeroDocumento: string | null; pasaporte: string | null; fechaNacimiento: string | null; email: string | null; telefono: string | null };
  const clientes = await leer<Cli>("Cliente", "id, nombre, apellidos, numeroDocumento, pasaporte, fechaNacimiento, email, telefono");
  console.log(`Clientes: ${clientes.length}`);
  const porNombre = new Map<string, Cli[]>();
  for (const c of clientes) { const k = claveNombre(c); if (k) porNombre.set(k, [...(porNombre.get(k) ?? []), c]); }
  const homonimos = [...porNombre.values()].filter((g) => g.length > 1);
  const sinDistinguir = homonimos.filter((g) => g.some((x, i) => g.some((y, j) => i < j && !chocan(x, y))));
  info(`${clientes.filter((c) => !c.numeroDocumento && !c.pasaporte).length} sin NIE/DNI ni pasaporte · ${clientes.filter((c) => !c.email && !c.telefono).length} sin email ni teléfono (los completa el cliente desde su enlace)`);
  ok(sinDistinguir.length === 0, `${homonimos.length} nombres repetidos, ${sinDistinguir.length} sin nada que los distinga (posibles duplicados a juntar)${sinDistinguir.length ? ": " + sinDistinguir.slice(0, 8).map((g) => `${g[0].nombre} ${g[0].apellidos ?? ""}`.trim()).join(" · ") : ""}`);
  // Orientativo: un documento no es siempre un cliente (trabajadores sacados del concepto, erratas de NIE…).
  if (control.personas != null) info(`documentos distintos en el archivo ${control.personas} · clientes en Aproba ${clientes.length} (explicar la diferencia antes de escribir al cliente)`);

  // ── Empresas ──
  const empresas = await leer<{ id: string; razonSocial: string; nif: string | null }>("Empresa", "id, razonSocial, nif");
  console.log(`\nEmpresas: ${empresas.length}`);
  info(`${empresas.filter((e) => !e.nif).length} sin CIF/NIF`);
  if (control.empresas != null) ok(empresas.length >= control.empresas, `CIF de empresa en el archivo ${control.empresas} · empresas en Aproba ${empresas.length}${empresas.length < control.empresas ? " (¿clientes con CIF que no se crearon como empresa?)" : ""}`);

  // ── Lo facturado antes de Aproba (historial migrado) ──
  type Hist = { id: string; clienteId: string | null; empresaId: string | null; fecha: string | null; importe: number | string | null; cobro: string | null; origen: string | null; pagoDeId: string | null; servicioClave: string | null };
  const hist = (await leer<Hist>("ServicioHistorico", "id, clienteId, empresaId, fecha, importe, cobro, origen, pagoDeId, servicioClave")).filter((h) => h.origen === "MIGRACION");
  const importe = (hs: Hist[]) => hs.reduce((t, h) => t + (h.importe != null ? Number(h.importe) : 0), 0);
  const pend = hist.filter((h) => h.cobro === "PENDIENTE");
  console.log(`\nHistorial migrado: ${hist.length} facturas · ${hist.filter((h) => !h.pagoDeId).length} servicios (${hist.filter((h) => h.pagoDeId).length} pagos siguientes enlazados)`);
  info(`importe total ${eur(importe(hist))} · pendiente de cobro ${pend.length} → ${eur(importe(pend))} · cobro desconocido ${hist.filter((h) => !h.cobro).length}`);
  info(`${hist.filter((h) => !h.fecha).length} sin fecha · ${hist.filter((h) => h.importe == null).length} sin importe · ${hist.filter((h) => !h.servicioClave).length} sin servicio del catálogo · ${hist.filter((h) => !h.clienteId).length} de empresas sin persona · ${hist.filter((h) => h.clienteId && h.empresaId).length} de trabajadores pagadas por su empresa`);
  if (control.facturas != null) ok(hist.length === control.facturas, `facturas: archivo ${control.facturas} · Aproba ${hist.length}`);
  if (control.importeTotal != null) ok(igual(importe(hist), control.importeTotal), `importe total: archivo ${eur(control.importeTotal)} · Aproba ${eur(importe(hist))}`);
  if (control.pendientes != null) ok(pend.length === control.pendientes, `pendientes: archivo ${control.pendientes} · Aproba ${pend.length}`);
  if (control.importePendiente != null) ok(igual(importe(pend), control.importePendiente), `pendiente de cobro: archivo ${eur(control.importePendiente)} · Aproba ${eur(importe(pend))}`);
  const conHistorial = new Set(hist.map((h) => h.clienteId).filter(Boolean));
  info(`${clientes.filter((c) => !conHistorial.has(c.id)).length} clientes sin ningún servicio migrado (normal si el despacho ya tenía cartera)`);

  // ── Renovaciones ──
  const venc = await leer<{ estado: string | null }>("Vencimiento", "estado");
  const porEstado = new Map<string, number>();
  for (const v of venc) porEstado.set(v.estado ?? "—", (porEstado.get(v.estado ?? "—") ?? 0) + 1);
  console.log(`\nRenovaciones: ${venc.length}${porEstado.size ? " · " + [...porEstado].map(([e, n]) => `${e} ${n}`).join(" · ") : ""}`);

  console.log(fallos ? `\n✗ ${fallos} punto(s) a revisar antes de escribir al cliente` : "\n✓ todo cuadra");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); });
