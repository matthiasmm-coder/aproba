import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";

export const generateMetadata = () => metadataDePagina("/quienes-somos");
export default function Page() { return <PaginaPublicaVista ruta="/quienes-somos" />; }
