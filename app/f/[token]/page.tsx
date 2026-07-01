import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { ordenParentesco } from "@/lib/familia";
import { PortalFamilia, type MiembroPortal, type DocPortal } from "@/components/portal-familia";

export const metadata = { title: "Portal familiar · Aproba" };

const CLI_COLS = `id, nombre, apellidos, parentesco, idioma, ${FICHA_KEYS.join(", ")}, expedientes:Expediente(id, referencia, estado, portalToken)`;

// Portal FAMILIAR (/f/[token]): un único enlace para que el titular rellene la ficha de
// todos los miembros y suba los documentos compartidos. El token de la familia ES la
// credencial (sin sesión Supabase), igual que el portal por expediente.
export default async function PortalFamiliaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();

  // Con documentos compartidos; repli sin ellos si la migración DocumentoFamilia falta.
  const SEL = `id, nombre, workspace:Workspace(nombre), clientes:Cliente(${CLI_COLS})`;
  let res = await admin.from("Familia").select(`${SEL}, documentos:DocumentoFamilia(id, tipo, nombreArchivo, createdAt)`).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Familia").select(SEL).eq("portalToken", token).maybeSingle();
  if (res.error || !res.data) notFound();

  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const fam = res.data as unknown as {
    id: string; nombre: string;
    workspace: { nombre: string } | { nombre: string }[] | null;
    clientes: (Record<string, unknown> & { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null; expedientes: { id: string; referencia: string; estado: string; portalToken: string | null }[] | null })[] | null;
    documentos?: { id: string; tipo: string; nombreArchivo: string | null; createdAt: string }[] | null;
  };
  const ws = uno(fam.workspace);

  const miembros: MiembroPortal[] = (fam.clientes ?? [])
    .map((c) => {
      const ficha: ClienteFicha = {};
      for (const k of FICHA_KEYS) { const v = c[k]; if (typeof v === "string") (ficha as Record<string, string>)[k] = v; }
      return {
        id: c.id,
        nombre: `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim() || "—",
        parentesco: c.parentesco ?? null,
        ficha,
        expedientes: (c.expedientes ?? []).filter((e) => e.portalToken).map((e) => ({ referencia: e.referencia, token: e.portalToken as string, estado: e.estado })),
      };
    })
    .sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco));

  const docs: DocPortal[] = (fam.documentos ?? []).map((d) => ({ id: d.id, tipo: d.tipo, nombreArchivo: d.nombreArchivo }));

  return (
    <PortalFamilia
      token={token}
      gestoria={ws?.nombre ?? "Aproba"}
      familiaNombre={fam.nombre}
      miembros={miembros}
      docs={docs}
    />
  );
}
