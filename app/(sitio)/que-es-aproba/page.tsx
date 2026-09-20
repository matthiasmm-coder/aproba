import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";

export const generateMetadata = () => metadataDePagina("/que-es-aproba");
export default function Page() { return <PaginaPublicaVista ruta="/que-es-aproba" />; }
