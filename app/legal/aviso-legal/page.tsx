import type { Metadata } from "next";
import Link from "next/link";
import { Dato } from "@/components/legal-dato";
import { TITULAR, ULTIMA_ACTUALIZACION } from "@/lib/legal";

export const metadata: Metadata = { title: "Aviso legal" };

export default function AvisoLegal() {
  return (
    <article className="legal-prose">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Última actualización: {ULTIMA_ACTUALIZACION}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">Aviso legal</h1>
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de
        la Información y de Comercio Electrónico (LSSI-CE), se ponen a disposición de los usuarios los
        siguientes datos del titular del sitio web y de la plataforma {TITULAR.nombreComercial}.
      </p>

      <h2 id="titular">1. Datos identificativos del titular</h2>
      <ul>
        <li><strong>Titular:</strong> <Dato>{TITULAR.razonSocial}</Dato></li>
        <li><strong>NIF/CIF:</strong> <Dato>{TITULAR.nif}</Dato></li>
        <li><strong>Domicilio:</strong> <Dato>{TITULAR.domicilio}</Dato></li>
        <li><strong>Datos registrales:</strong> <Dato>{TITULAR.registro}</Dato></li>
        <li><strong>Correo electrónico:</strong> <a href={`mailto:${TITULAR.email}`}>{TITULAR.email}</a></li>
        <li><strong>Sitio web:</strong> <a href={TITULAR.web}>{TITULAR.dominio}</a></li>
        <li><strong>Nombre comercial:</strong> {TITULAR.nombreComercial}</li>
      </ul>

      <h2 id="objeto">2. Objeto</h2>
      <p>
        {TITULAR.nombreComercial} es una plataforma de software como servicio (SaaS) dirigida a gestorías,
        despachos de abogados y profesionales del ámbito de la extranjería en España. Permite digitalizar,
        validar y hacer el seguimiento de los expedientes de extranjería, generar formularios oficiales
        (modelos EX y tasa 790-012) y gestionar la comunicación con los clientes del despacho.
      </p>
      <p>
        El acceso y uso de la plataforma atribuye la condición de usuario e implica la aceptación de este
        Aviso legal, de las <Link href="/legal/terminos">Condiciones de uso</Link> y de la{" "}
        <Link href="/legal/privacidad">Política de privacidad</Link>.
      </p>

      <h2 id="acceso">3. Condiciones de acceso y uso</h2>
      <p>
        El acceso a la plataforma requiere registro y la contratación de un plan. El usuario se compromete a
        hacer un uso lícito de los servicios, conforme a la ley, a este Aviso legal y a las Condiciones de
        uso, y a no emplear la plataforma para fines ilícitos o lesivos de derechos de terceros.
      </p>
      <p>
        El usuario es responsable de la veracidad de los datos facilitados y de la custodia de sus
        credenciales de acceso. El titular podrá suspender el acceso ante un uso indebido o fraudulento.
      </p>

      <h2 id="propiedad">4. Propiedad intelectual e industrial</h2>
      <p>
        Todos los derechos sobre el software, el código, el diseño, los logotipos, la marca{" "}
        {TITULAR.nombreComercial} y los contenidos de la plataforma corresponden al titular o a terceros que
        han autorizado su uso. Queda prohibida su reproducción, distribución, comunicación pública,
        transformación o cualquier otra forma de explotación sin autorización expresa.
      </p>
      <p>
        Los datos y documentos introducidos por cada despacho y por sus clientes son propiedad de estos; el
        titular se limita a tratarlos como encargado del tratamiento según se describe en el{" "}
        <Link href="/legal/dpa">Contrato de encargado del tratamiento</Link>.
      </p>

      <h2 id="responsabilidad">5. Exclusión de responsabilidad</h2>
      <p>
        El titular trabaja para mantener la plataforma disponible y libre de errores, pero no garantiza la
        ausencia de interrupciones ni la inexistencia de fallos. No se responsabiliza de los daños derivados
        de la indisponibilidad temporal, de fuerza mayor o de un uso indebido por parte del usuario.
      </p>
      <p>
        Los formularios y borradores generados por la plataforma son una ayuda a la tramitación. La revisión
        final, la firma y la presentación ante la Administración son responsabilidad del despacho
        profesional usuario. El titular no presta asesoramiento jurídico.
      </p>

      <h2 id="enlaces">6. Enlaces a terceros</h2>
      <p>
        La plataforma puede contener enlaces a sitios de terceros (por ejemplo, sedes electrónicas de la
        Administración). El titular no se responsabiliza del contenido ni de las políticas de dichos sitios.
      </p>

      <h2 id="datos">7. Protección de datos</h2>
      <p>
        El tratamiento de los datos personales se rige por la{" "}
        <Link href="/legal/privacidad">Política de privacidad</Link> y, en lo relativo a los datos de los
        clientes del despacho, por el <Link href="/legal/dpa">Contrato de encargado del tratamiento</Link>.
      </p>

      <h2 id="legislacion">8. Legislación aplicable y jurisdicción</h2>
      <p>
        Este Aviso legal se rige por la legislación española. Para la resolución de cualquier controversia,
        las partes se someten a los juzgados y tribunales del domicilio del titular, salvo que la normativa
        de consumo aplicable disponga otro fuero.
      </p>

      <h2 id="modificaciones">9. Modificaciones</h2>
      <p>
        El titular se reserva el derecho de modificar el presente Aviso legal para adaptarlo a novedades
        legislativas o cambios en la plataforma. La versión vigente es la publicada en esta página.
      </p>
    </article>
  );
}
