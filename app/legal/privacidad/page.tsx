import type { Metadata } from "next";
import Link from "next/link";
import { Dato } from "@/components/legal-dato";
import { TITULAR, ULTIMA_ACTUALIZACION, AEPD, SUBENCARGADOS } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  return (
    <article className="legal-prose">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Última actualización: {ULTIMA_ACTUALIZACION}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">Política de privacidad</h1>
      <p>
        Esta Política explica cómo {TITULAR.nombreComercial} trata los datos personales conforme al
        Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018, de Protección de Datos Personales y
        garantía de los derechos digitales (LOPDGDD).
      </p>

      <h2 id="dos-roles">1. Dos tratamientos distintos</h2>
      <p>Conviene distinguir desde el principio:</p>
      <ul>
        <li>
          <strong>Datos del despacho usuario (Aproba como responsable):</strong> los datos de quien contrata
          y usa Aproba (profesional, gestoría o despacho) y de los miembros de su equipo. Este tratamiento
          se rige por la presente Política.
        </li>
        <li>
          <strong>Datos de los clientes del despacho (Aproba como encargado):</strong> los datos de las
          personas extranjeras cuyos expedientes tramita el despacho (pasaporte, NIE, domicilio,
          documentación). Sobre estos datos, el <strong>despacho es el responsable</strong> y Aproba actúa
          como <strong>encargado del tratamiento</strong>, tratándolos únicamente siguiendo sus
          instrucciones. Las condiciones figuran en el{" "}
          <Link href="/legal/dpa">Contrato de encargado del tratamiento (DPA)</Link>.
        </li>
      </ul>

      <h2 id="responsable">2. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Titular:</strong> <Dato>{TITULAR.razonSocial}</Dato></li>
        <li><strong>NIF/CIF:</strong> <Dato>{TITULAR.nif}</Dato></li>
        <li><strong>Domicilio:</strong> <Dato>{TITULAR.domicilio}</Dato></li>
        <li>
          <strong>Contacto en materia de privacidad:</strong>{" "}
          <a href={`mailto:${TITULAR.emailPrivacidad}`}>{TITULAR.emailPrivacidad}</a>
        </li>
      </ul>

      <h2 id="datos">3. Qué datos tratamos, con qué fin y con qué base</h2>
      <table>
        <thead>
          <tr>
            <th>Categoría de datos</th>
            <th>Finalidad</th>
            <th>Base jurídica (RGPD art. 6)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Identificación y contacto (nombre, email, teléfono) y datos del despacho (nombre, NIF).</td>
            <td>Crear y gestionar la cuenta, prestar el servicio y dar soporte.</td>
            <td>Ejecución del contrato (art. 6.1.b).</td>
          </tr>
          <tr>
            <td>Datos de facturación y pago (gestionados por Stripe; Aproba no almacena el número de tarjeta).</td>
            <td>Cobro de la suscripción y obligaciones contables y fiscales.</td>
            <td>Ejecución del contrato (art. 6.1.b) y obligación legal (art. 6.1.c).</td>
          </tr>
          <tr>
            <td>Datos de uso y técnicos (registros de acceso, dirección IP, eventos de la aplicación).</td>
            <td>Seguridad, prevención del fraude, funcionamiento y mejora del servicio.</td>
            <td>Interés legítimo (art. 6.1.f).</td>
          </tr>
          <tr>
            <td>Comunicaciones (correos de servicio y, en su caso, comerciales).</td>
            <td>Informar sobre el servicio y, con consentimiento, enviar novedades.</td>
            <td>Interés legítimo / consentimiento (art. 6.1.f / 6.1.a).</td>
          </tr>
        </tbody>
      </table>
      <p>
        Los datos de los clientes del despacho (incluidos los que puedan revelar la nacionalidad u otros
        aspectos sensibles) se tratan exclusivamente como encargado, por cuenta del despacho y según el{" "}
        <Link href="/legal/dpa">DPA</Link>. El despacho es responsable de contar con una base de
        legitimación válida para esos tratamientos.
      </p>

      <h2 id="conservacion">4. Plazos de conservación</h2>
      <ul>
        <li>Datos de la cuenta: mientras la relación contractual esté vigente.</li>
        <li>
          Tras la baja: se conservan bloqueados durante los plazos de prescripción legal (mercantil, fiscal),
          generalmente hasta 6 años para la facturación, y después se suprimen.
        </li>
        <li>
          Datos de los clientes del despacho: se conservan y se devuelven o suprimen según las instrucciones
          del despacho, conforme al <Link href="/legal/dpa">DPA</Link>.
        </li>
      </ul>

      <h2 id="destinatarios">5. Destinatarios y encargados</h2>
      <p>
        No se ceden datos a terceros salvo obligación legal. Para prestar el servicio, intervienen los
        siguientes proveedores que actúan como encargados del tratamiento, con contrato conforme al art. 28
        del RGPD:
      </p>
      <table>
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Finalidad</th>
            <th>Ubicación</th>
            <th>Garantía</th>
          </tr>
        </thead>
        <tbody>
          {SUBENCARGADOS.map((s) => (
            <tr key={s.nombre}>
              <td>{s.nombre}</td>
              <td>{s.finalidad}</td>
              <td>{s.ubicacion}</td>
              <td>{s.garantia}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="transferencias">6. Transferencias internacionales</h2>
      <p>
        Algunos proveedores están ubicados fuera del Espacio Económico Europeo (por ejemplo, en Estados
        Unidos). Dichas transferencias se amparan en las Cláusulas Contractuales Tipo aprobadas por la
        Comisión Europea (SCC) y/o en marcos de adecuación reconocidos, con medidas adicionales cuando
        procede. La base de datos y los documentos del expediente se alojan en la Unión Europea.
      </p>

      <h2 id="derechos">7. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de <strong>acceso, rectificación, supresión, oposición, limitación del
        tratamiento y portabilidad</strong>, así como retirar el consentimiento prestado, escribiendo a{" "}
        <a href={`mailto:${TITULAR.emailPrivacidad}`}>{TITULAR.emailPrivacidad}</a>, indicando el derecho que
        deseas ejercer y adjuntando un documento que acredite tu identidad.
      </p>
      <p>
        Si consideras que el tratamiento no se ajusta a la normativa, puedes presentar una reclamación ante
        la <a href={AEPD.web} target="_blank" rel="noopener noreferrer">{AEPD.nombre}</a> ({AEPD.direccion}).
      </p>
      <p>
        Si eres cliente de un despacho que usa Aproba y quieres ejercer tus derechos sobre tu expediente,
        debes dirigirte a tu despacho (responsable de esos datos); Aproba le trasladará tu solicitud cuando
        la reciba.
      </p>

      <h2 id="seguridad">8. Seguridad</h2>
      <p>
        Aproba aplica medidas técnicas y organizativas apropiadas: cifrado en tránsito (HTTPS) y en reposo,
        almacenamiento de documentos en un bucket privado, control de acceso multiusuario con aislamiento por
        despacho (políticas de seguridad a nivel de fila) y registro de eventos. Ningún sistema es
        infalible, pero trabajamos para mantener un nivel de protección adecuado al riesgo.
      </p>

      <h2 id="menores">9. Menores</h2>
      <p>
        La plataforma se dirige a profesionales. Las cuentas no están destinadas a menores de edad. Los datos
        de clientes menores que un despacho pueda tramitar se rigen por las instrucciones del despacho y por
        el DPA.
      </p>

      <h2 id="cambios">10. Cambios en esta política</h2>
      <p>
        Podemos actualizar esta Política para reflejar cambios legales o del servicio. Publicaremos la versión
        vigente en esta página e indicaremos la fecha de última actualización.
      </p>
    </article>
  );
}
