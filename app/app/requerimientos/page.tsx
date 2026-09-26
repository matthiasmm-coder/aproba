import { redirect } from "next/navigation";

// «Requerimientos» fue una cuarta vista de Expedientes del 21 al 26/09/2026. Hoy es un
// FILTRO de «En curso» (Matthias, 26/09): los requerimientos se ven en la fila de su
// expediente, con los días que quedan y lo que hay que aportar. Esta ruta sigue viva
// para los enlaces antiguos (emails de aviso ya enviados, marcadores).
export default function RequerimientosPage() {
  redirect("/app/expedientes?filtro=requerimientos");
}
