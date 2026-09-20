import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";

export const generateMetadata = () => metadataDePagina("/precios");
export default function Page() { return <PaginaPublicaVista ruta="/precios" />; }
