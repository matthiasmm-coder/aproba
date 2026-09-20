import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";

export const generateMetadata = () => metadataDePagina("/despegue");
export default function Page() { return <PaginaPublicaVista ruta="/despegue" />; }
