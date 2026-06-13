import type { Metadata } from "next";
import Link from "next/link";
import { Dato } from "@/components/legal-dato";
import { TITULAR, ULTIMA_ACTUALIZACION, SUBENCARGADOS } from "@/lib/legal";

export const metadata: Metadata = { title: "Encargado del tratamiento (DPA)" };

export default function DPA() {
  return (
    <article className="legal-prose">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Última actualización: {ULTIMA_ACTUALIZACION}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">
        Contrato de encargado del tratamiento
      </h1>
      <p>
        Este Contrato (o «DPA», por sus siglas en inglés) regula el tratamiento de datos personales que{" "}
        <Dato>{TITULAR.razonSocial}</Dato> («Aproba», <strong>encargado del tratamiento</strong>) realiza por
        cuenta del despacho, gestoría o profesional que usa la plataforma («el Cliente»,{" "}
        <strong>responsable del tratamiento</strong>), conforme al artículo 28 del RGPD. Forma parte
        inseparable de los <Link href="/legal/terminos">Términos y condiciones</Link> y se entiende aceptado
        al contratar el servicio.
      </p>

      <h2 id="objeto">1. Objeto y roles</h2>
      <p>
        El Cliente es el responsable de los datos personales de sus propios clientes (las personas extranjeras
        cuyos expedientes tramita) y demás interesados que introduzca en la plataforma. Aproba trata dichos
        datos <strong>únicamente por cuenta del Cliente y siguiendo sus instrucciones documentadas</strong>,
        que incluyen las dadas a través del uso normal de la plataforma y las recogidas en este DPA.
      </p>

      <h2 id="descripcion">2. Descripción del tratamiento (art. 28.3 RGPD)</h2>
      <ul>
        <li>
          <strong>Objeto y naturaleza:</strong> alojamiento, organización, validación asistida por IA,
          generación de formularios oficiales y comunicación, en el marco de la tramitación de expedientes de
          extranjería.
        </li>
        <li>
          <strong>Finalidad:</strong> permitir al Cliente prestar sus servicios profesionales a sus clientes.
        </li>
        <li>
          <strong>Duración:</strong> mientras esté vigente la relación contractual, más los plazos de
          devolución o supresión de la cláusula 8.
        </li>
        <li>
          <strong>Tipos de datos:</strong> identificativos y de contacto, documentos de identidad (pasaporte,
          NIE, tarjetas de residencia), datos de domicilio y familiares, datos económicos y laborales, y
          cualquier otro contenido en la documentación que el Cliente suba. Puede incluir datos que revelen la
          nacionalidad y, eventualmente, categorías especiales; el Cliente garantiza contar con base de
          legitimación válida para tratarlos.
        </li>
        <li>
          <strong>Categorías de interesados:</strong> los clientes del despacho y personas relacionadas con
          sus expedientes.
        </li>
      </ul>

      <h2 id="obligaciones">3. Obligaciones de Aproba como encargado</h2>
      <p>Aproba se compromete a:</p>
      <ul>
        <li>tratar los datos solo conforme a las instrucciones del Cliente, salvo obligación legal;</li>
        <li>
          garantizar que las personas autorizadas a tratar los datos se han comprometido a la
          confidencialidad;
        </li>
        <li>
          aplicar las medidas de seguridad técnicas y organizativas apropiadas (art. 32): cifrado en tránsito
          y en reposo, almacenamiento en bucket privado, aislamiento por despacho mediante políticas de
          seguridad a nivel de fila, control de acceso por roles y registro de eventos;
        </li>
        <li>
          asistir al Cliente para responder a las solicitudes de ejercicio de derechos de los interesados;
        </li>
        <li>
          ayudar al Cliente a cumplir sus obligaciones de seguridad, notificación de brechas y evaluaciones de
          impacto;
        </li>
        <li>
          poner a disposición del Cliente la información necesaria para demostrar el cumplimiento y permitir
          auditorías razonables;
        </li>
        <li>
          no tratar los datos del expediente para finalidades propias ni para entrenar modelos de inteligencia
          artificial.
        </li>
      </ul>

      <h2 id="subencargados">4. Subencargados</h2>
      <p>
        El Cliente autoriza a Aproba a recurrir a los subencargados necesarios para prestar el servicio, con
        un contrato que les imponga las mismas obligaciones de protección de datos. La lista vigente es:
      </p>
      <table>
        <thead>
          <tr>
            <th>Subencargado</th>
            <th>Finalidad</th>
            <th>Ubicación</th>
          </tr>
        </thead>
        <tbody>
          {SUBENCARGADOS.map((s) => (
            <tr key={s.nombre}>
              <td>{s.nombre}</td>
              <td>{s.finalidad}</td>
              <td>{s.ubicacion}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Aproba informará de cualquier cambio previsto en los subencargados, dando al Cliente la posibilidad de
        oponerse por motivos razonables.
      </p>

      <h2 id="transferencias">5. Transferencias internacionales</h2>
      <p>
        Cuando un subencargado esté fuera del EEE, la transferencia se ampara en las Cláusulas Contractuales
        Tipo de la Comisión Europea (SCC) y/o en marcos de adecuación, con medidas adicionales cuando proceda.
        La base de datos y los documentos se alojan en la Unión Europea.
      </p>

      <h2 id="brechas">6. Violaciones de seguridad</h2>
      <p>
        Aproba notificará al Cliente sin dilación indebida tras tener conocimiento de una violación de la
        seguridad que afecte a los datos tratados por su cuenta, facilitando la información disponible para
        que el Cliente cumpla, en su caso, con sus deberes de notificación a la autoridad de control y a los
        interesados.
      </p>

      <h2 id="fin">7. Devolución o supresión al finalizar</h2>
      <p>
        A la finalización del servicio, y a elección del Cliente, Aproba le devolverá los datos en un formato
        estándar o los suprimirá, junto con las copias existentes, salvo que deba conservarlos por obligación
        legal. El Cliente dispondrá de un plazo razonable para exportar sus datos antes de la supresión.
      </p>

      <h2 id="responsabilidad">8. Responsabilidad</h2>
      <p>
        Cada parte responde del cumplimiento de las obligaciones que el RGPD le atribuye según su rol. La
        limitación de responsabilidad pactada en los{" "}
        <Link href="/legal/terminos">Términos y condiciones</Link> resulta de aplicación a este DPA en la
        medida permitida por la ley.
      </p>

      <h2 id="contacto">9. Contacto</h2>
      <p>
        Para cualquier cuestión relativa a este Contrato:{" "}
        <a href={`mailto:${TITULAR.emailPrivacidad}`}>{TITULAR.emailPrivacidad}</a>.
      </p>
    </article>
  );
}
