import { fetchVencimientos } from "@/lib/data/vencimientos";
import { VencimientosList } from "@/components/vencimientos-list";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Vencimientos" };
export const dynamic = "force-dynamic";

// VIGÍA — radar de vencimientos: qué tarjetas caducan, cuándo, y el botón
// «Iniciar renovación» que convierte cada caducidad en un expediente nuevo.
export default async function VencimientosPage() {
  const t = await getT();
  const vencimientos = await fetchVencimientos();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Vencimientos")}</h1>
      <p className="mt-1 text-slate-500">{t("Las tarjetas de tus clientes que caducan pronto. Inicia la renovación con un clic: se crea el expediente y se avisa al cliente en su idioma.")}</p>
      <VencimientosList vencimientos={vencimientos} />
    </div>
  );
}
