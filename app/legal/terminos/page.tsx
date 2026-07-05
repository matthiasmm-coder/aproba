import type { Metadata } from "next";
import Link from "next/link";
import { Dato } from "@/components/legal-dato";
import { TITULAR, ULTIMA_ACTUALIZACION } from "@/lib/legal";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function Terminos() {
  return (
    <article className="legal-prose">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Última actualización: {ULTIMA_ACTUALIZACION}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">
        Términos y condiciones de uso
      </h1>
      <p>
        Estas condiciones regulan la contratación y el uso de la plataforma {TITULAR.nombreComercial} entre el
        titular, <Dato>{TITULAR.razonSocial}</Dato> («Aproba»), y el profesional, gestoría o despacho que la
        contrata («el Cliente»). Al registrarse, el Cliente acepta estas condiciones.
      </p>

      <h2 id="objeto">1. Objeto</h2>
      <p>
        Aproba concede al Cliente una licencia de uso, no exclusiva e intransferible, de la plataforma SaaS
        para la gestión de expedientes de extranjería, durante la vigencia de la suscripción y según el plan
        contratado.
      </p>

      <h2 id="cuenta">2. Registro y cuenta</h2>
      <p>
        El Cliente debe ser mayor de edad y actuar como profesional. Se compromete a facilitar datos veraces,
        a mantener la confidencialidad de sus credenciales y a notificar cualquier uso no autorizado. El
        Cliente es responsable de la actividad de los usuarios de su equipo.
      </p>

      <h2 id="planes">3. Planes, precios y periodo de prueba</h2>
      <ul>
        <li>
          Los planes disponibles y sus precios son los publicados en{" "}
          <a href={TITULAR.web}>{TITULAR.dominio}</a> en el momento de la contratación. Los precios se
          expresan sin IVA, que se añadirá cuando corresponda.
        </li>
        <li>
          Aproba puede ofrecer un <strong>periodo de prueba gratuito</strong>. Al finalizar, si no se activa
          una suscripción de pago, el acceso puede quedar limitado.
        </li>
        <li>
          <strong>Durante el periodo de prueba gratuito se aplican íntegramente</strong> estos Términos, la{" "}
          <Link href="/legal/privacidad">Política de privacidad</Link> y el{" "}
          <Link href="/legal/dpa">Contrato de encargado del tratamiento (DPA)</Link>, con las mismas garantías
          técnicas y organizativas que en una suscripción de pago, aunque no exista todavía contratación ni
          factura emitida. El uso de la plataforma durante la prueba implica la aceptación de dichas
          condiciones.
        </li>
        <li>
          El número de usuarios y los límites dependen del plan (por ejemplo, Starter, Pro y Business).
        </li>
      </ul>

      <h2 id="pago">4. Pago y facturación</h2>
      <p>
        La suscripción se factura por adelantado de forma periódica (mensual, salvo indicación distinta) a
        través de nuestro proveedor de pagos <strong>Stripe</strong>. Al contratar, el Cliente autoriza el
        cargo recurrente en el medio de pago facilitado. La falta de pago puede suspender el acceso.
      </p>
      <p>
        El cambio de plan se aplica de inmediato con el prorrateo correspondiente. El Cliente puede gestionar
        su suscripción y sus facturas desde el panel de Aproba.
      </p>

      <h2 id="duracion">5. Duración, renovación y cancelación</h2>
      <p>
        La suscripción se renueva automáticamente por periodos iguales salvo cancelación. El Cliente puede
        cancelar en cualquier momento desde el panel; la cancelación surte efecto al final del periodo ya
        pagado, sin nuevos cargos. Salvo obligación legal, las cuotas ya abonadas no son reembolsables.
      </p>

      <h2 id="obligaciones">6. Obligaciones y uso aceptable</h2>
      <p>El Cliente se compromete a no:</p>
      <ul>
        <li>usar la plataforma para fines ilícitos o contrarios a la buena fe;</li>
        <li>introducir datos sin contar con la legitimación necesaria;</li>
        <li>intentar acceder a datos de otros despachos, ni vulnerar la seguridad del sistema;</li>
        <li>revender o ceder el acceso a terceros sin autorización.</li>
      </ul>

      <h2 id="datos">7. Datos del Cliente y de sus clientes</h2>
      <p>
        Los datos y documentos que el Cliente y sus clientes introducen siguen siendo de su titularidad.
        Respecto de los datos personales de los clientes del despacho, Aproba actúa como encargado del
        tratamiento conforme al <Link href="/legal/dpa">Contrato de encargado del tratamiento (DPA)</Link>,
        que forma parte de estas condiciones.
      </p>

      <h2 id="disponibilidad">8. Disponibilidad y soporte</h2>
      <p>
        Aproba pondrá medios razonables para mantener el servicio disponible, pero no garantiza una
        disponibilidad ininterrumpida. Podrán realizarse tareas de mantenimiento, preferentemente con aviso.
        El soporte se presta por correo electrónico en{" "}
        <a href={`mailto:${TITULAR.email}`}>{TITULAR.email}</a>.
      </p>

      <h2 id="responsabilidad">9. Limitación de responsabilidad</h2>
      <p>
        Aproba es una herramienta de apoyo. La validación de documentos asistida por IA y los formularios
        generados <strong>no sustituyen el criterio profesional</strong> del Cliente, que es responsable de
        revisar, firmar y presentar los expedientes ante la Administración. En la medida permitida por la
        ley, la responsabilidad de Aproba se limita al importe abonado por el Cliente en los doce meses
        anteriores al hecho que motive la reclamación. Aproba no responde de daños indirectos ni de lucro
        cesante.
      </p>

      <h2 id="modificaciones">10. Modificación de las condiciones</h2>
      <p>
        Aproba puede modificar estas condiciones o los precios, notificándolo con antelación razonable. Si el
        Cliente no está de acuerdo, podrá cancelar antes de que surtan efecto. El uso continuado implica su
        aceptación.
      </p>

      <h2 id="resolucion">11. Suspensión y resolución</h2>
      <p>
        Aproba podrá suspender o resolver el contrato en caso de incumplimiento grave, impago o uso
        fraudulento. A la finalización, el Cliente podrá exportar sus datos durante un plazo razonable, tras
        el cual se suprimirán según la <Link href="/legal/privacidad">Política de privacidad</Link> y el DPA.
      </p>

      <h2 id="legislacion">12. Legislación aplicable y jurisdicción</h2>
      <p>
        Estas condiciones se rigen por la legislación española. Las controversias se someterán a los juzgados
        y tribunales del domicilio del titular, salvo fuero imperativo distinto.
      </p>
    </article>
  );
}
