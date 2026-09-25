// DESHACER una migración — ÚLTIMO RECURSO (web/MIGRACION.md, «Retour arrière»). Borra lo que
// se CREÓ entre dos fotos (foto-antes / foto-despues de ejecutar.ts) en ESE despacho, y nada
// más. Lo que la migración COMPLETÓ en fichas que ya existían (huecos rellenados) no se toca.
// Nunca borra una ficha que ya tiene vida propia en Aproba (facturas, expedientes nuevos,
// documentos): la lista y la deja.
//
// Sin MIGRA_CONFIRMAR=borrar solo LISTA lo que borraría. Para borrar hacen falta las dos
// llaves (MIGRA_CONFIRMAR=borrar y MIGRA_DESPACHO="<nombre exacto>") y la orden de Matthias.
//   MIGRA_WS=… MIGRA_ANTES=foto-antes-….json MIGRA_DESPUES=foto-despues-….json \
//     scripts/migracion/correr.sh scripts/migracion/deshacer.ts

import { readFileSync } from "node:fs";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Foto } from "./foto";

(async () => {
  const ws = process.env.MIGRA_WS ?? "";
  const antes = JSON.parse(readFileSync(process.env.MIGRA_ANTES ?? "", "utf8")) as Foto;
  const despues = JSON.parse(readFileSync(process.env.MIGRA_DESPUES ?? "", "utf8")) as Foto;
  if (!ws || antes.workspaceId !== ws || despues.workspaceId !== ws) throw new Error("las dos fotos deben ser de MIGRA_WS");
  if (antes.fecha >= despues.fecha) throw new Error("MIGRA_ANTES debe ser anterior a MIGRA_DESPUES");
  const a = createSupabaseAdmin();
  const creados = (t: string) => { const ya = new Set(antes.ids[t] ?? []); return (despues.ids[t] ?? []).filter((id) => !ya.has(id)); };
  const hay = async (tabla: string, col: string, ids: string[], excluir: string[] = []) => {
    const con = new Set<string>();
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await a.from(tabla).select(`id, ${col}`).in(col, ids.slice(i, i + 150));
      if (error) { if (/does not exist|schema cache/i.test(error.message)) return con; throw new Error(`${tabla}: ${error.message}`); }
      for (const r of (data ?? []) as unknown as Record<string, string>[]) if (!excluir.includes(r.id)) con.add(r[col]);
    }
    return con;
  };

  const exp = creados("Expediente"), hist = creados("ServicioHistorico"), venc = creados("Vencimiento");
  const cli = creados("Cliente"), fam = creados("Familia"), emp = creados("Empresa");
  // Vida propia desde la migración → no se borra.
  const expVivos = new Set([...(await hay("Factura", "expedienteId", exp)), ...(await hay("Documento", "expedienteId", exp))]);
  const expBorrar = exp.filter((id) => !expVivos.has(id));
  const cliVivos = new Set([...(await hay("Factura", "clienteId", cli)), ...(await hay("Expediente", "clienteId", cli, expBorrar)), ...(await hay("DocumentoCliente", "clienteId", cli))]);
  const cliBorrar = cli.filter((id) => !cliVivos.has(id));
  const empVivas = new Set([...(await hay("Cliente", "empresaId", emp, cliBorrar)), ...(await hay("Factura", "empresaId", emp)), ...(await hay("Expediente", "empresaId", emp, expBorrar)), ...(await hay("DocumentoEmpresa", "empresaId", emp))]);
  const empBorrar = emp.filter((id) => !empVivas.has(id));
  const famConMiembros = await hay("Cliente", "familiaId", fam, cliBorrar); // una familia solo se va si se queda sin miembros

  const { data: w } = await a.from("Workspace").select("nombre").eq("id", ws).single();
  const despacho = (w as { nombre: string } | null)?.nombre ?? "";
  console.log(`«${despacho}» · creado entre ${antes.fecha} y ${despues.fecha}:`);
  console.log(`  expedientes ${exp.length} (se quedan ${expVivos.size} con facturas o documentos)`);
  console.log(`  servicios del historial ${hist.length} · renovaciones ${venc.length}`);
  console.log(`  clientes ${cli.length} (se quedan ${cliVivos.size} con vida propia) · familias ${fam.length} · empresas ${emp.length} (se quedan ${empVivas.size})`);
  if (process.env.MIGRA_CONFIRMAR !== "borrar") { console.log("\n(solo lista: nada borrado)"); return; }
  if (process.env.MIGRA_DESPACHO !== despacho) throw new Error(`MIGRA_DESPACHO no coincide con «${despacho}»: nada borrado`);

  const borrar = async (tabla: string, ids: string[], col = "id") => {
    for (let i = 0; i < ids.length; i += 150) {
      const { error } = await a.from(tabla).delete().eq("workspaceId", ws).in(col, ids.slice(i, i + 150));
      if (error) throw new Error(`${tabla}: ${error.message}`);
    }
  };
  for (let i = 0; i < expBorrar.length; i += 150) await a.from("ExpedienteEvento").delete().in("expedienteId", expBorrar.slice(i, i + 150));
  await borrar("Expediente", expBorrar);
  await borrar("ServicioHistorico", hist);
  await borrar("Vencimiento", venc);
  await borrar("Cliente", cliBorrar);
  await borrar("Familia", fam.filter((id) => !famConMiembros.has(id)));
  await borrar("Empresa", empBorrar);
  console.log("\n✓ borrado. Toma una foto nueva (foto.ts) y compárala con la de antes.");
})().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); });
