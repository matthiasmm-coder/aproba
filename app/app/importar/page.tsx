import { ImportarDatos } from "@/components/importar-datos";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Importar datos" };

// Migración: importa clientes, expedientes históricos y familias desde CUALQUIER
// Excel/CSV (el de siempre del despacho, o el export de MN Program/Sudespacho…).
export default async function ImportarPage() {
  const t = await getT();
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("Importar datos")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("Trae tu cartera tal como la tienes: Excel, CSV o el export de tu programa. La IA entiende tus columnas y tú confirmas.")}</p>
      <div className="mt-6">
        <ImportarDatos />
      </div>
    </div>
  );
}
