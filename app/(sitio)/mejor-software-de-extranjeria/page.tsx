import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";

export const generateMetadata = () => metadataDePagina("/mejor-software-de-extranjeria");
export default function Page() { return <PaginaPublicaVista ruta="/mejor-software-de-extranjeria" />; }
