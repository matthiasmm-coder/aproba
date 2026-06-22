import type { Metadata } from "next";
import Link from "next/link";
import { TITULAR, AEPD } from "@/lib/legal";

export const metadata = {
  title: "Privacidad de la extensión «Aproba para Mercurio»",
  description:
    "Política de privacidad de la extensión de navegador «Aproba para Mercurio»: qué datos trata, dónde se procesan y cómo se usan. Todo el tratamiento ocurre en tu dispositivo.",
} satisfies Metadata;

const ACTUALIZACION = "22 de junio de 2026";

export default function PrivacidadExtension() {
  return (
    <article className="legal-prose">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Última actualización: {ACTUALIZACION}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">
        Política de privacidad de la extensión «Aproba para Mercurio»
      </h1>
      <p>
        Esta política se refiere específicamente a la extensión de navegador{" "}
        <strong>«Aproba para Mercurio»</strong> publicada por {TITULAR.nombreComercial}. Explica qué
        datos trata la extensión, dónde se procesan y con qué finalidad. Para el tratamiento general de
        datos en la plataforma web de Aproba, consulta la{" "}
        <Link href="/legal/privacidad">Política de privacidad</Link>.
      </p>

      <div className="my-4 rounded-lg border border-aproba-100 bg-aproba-50 px-4 py-3 text-sm text-slate-700">
        <strong>En una frase:</strong> la extensión copia los datos de un expediente que ya tienes en tu
        cuenta de Aproba dentro del formulario oficial de Mercurio, <strong>en tu propio navegador</strong>.
        No envía datos a ningún servidor, no los vende y no los usa para ninguna otra finalidad.
      </div>

      <h2 id="finalidad">1. Finalidad única</h2>
      <p>
        La extensión tiene una <strong>única finalidad</strong>: rellenar automáticamente el formulario
        de la plataforma Mercurio de extranjería (
        <a href="https://mercurio.delegaciondelgobierno.gob.es/mercurio/" target="_blank" rel="noopener noreferrer">
          mercurio.delegaciondelgobierno.gob.es
        </a>
        ) con los datos del solicitante que el profesional ya gestiona en su cuenta de Aproba, para
        evitar tener que teclearlos uno a uno. La extensión <strong>no firma ni presenta</strong> nada:
        el profesional se identifica, adjunta la documentación y firma con su propio certificado.
      </p>

      <h2 id="datos">2. Qué datos trata</h2>
      <p>
        Para rellenar el formulario, la extensión maneja los datos identificativos y de contacto del
        solicitante del expediente, que pueden incluir:
      </p>
      <ul>
        <li>Nombre y apellidos.</li>
        <li>Número de documento (NIE o pasaporte).</li>
        <li>Fecha y lugar de nacimiento, país de nacimiento, nacionalidad y estado civil.</li>
        <li>Nombre del padre y de la madre.</li>
        <li>Domicilio en España (vía, número, piso, código postal, municipio y provincia).</li>
        <li>Teléfono y correo electrónico.</li>
      </ul>
      <p>
        Estos datos pueden tener carácter personal y, en su caso, revelar la nacionalidad de la persona.
        La extensión <strong>no recopila</strong> historial de navegación, contraseñas, ni datos de otras
        páginas web distintas de las indicadas.
      </p>

      <h2 id="flujo">3. Cómo se obtienen y dónde se procesan</h2>
      <ul>
        <li>
          Los datos se leen <strong>únicamente</strong> de tu propia cuenta de Aproba, cuando estás dentro
          de un expediente y pulsas el botón <strong>«Rellenar en Mercurio»</strong>. La página de Aproba
          entrega los datos a la extensión dentro del mismo navegador (mediante mensajería local de la
          página, sin salir a Internet).
        </li>
        <li>
          La extensión guarda esos datos en el almacenamiento local del navegador (
          <code>chrome.storage.local</code>), <strong>en tu dispositivo</strong>, para poder escribirlos
          en las casillas de Mercurio cuando abres el formulario.
        </li>
        <li>
          <strong>Los datos no se transmiten a ningún servidor</strong> de Aproba ni de terceros: la
          extensión no realiza ninguna petición de red con tus datos. No hay analítica, ni rastreo, ni
          publicidad. Todo el procesamiento ocurre localmente.
        </li>
      </ul>

      <h2 id="permisos">4. Permisos que solicita y por qué</h2>
      <ul>
        <li>
          <strong><code>storage</code></strong>: para guardar temporalmente, en tu dispositivo, los datos
          del expediente que se van a escribir en el formulario.
        </li>
        <li>
          <strong>Acceso a <code>aproba-software.com</code></strong>: para leer los datos del expediente
          desde tu cuenta cuando pulsas «Rellenar en Mercurio».
        </li>
        <li>
          <strong>Acceso a <code>mercurio.delegaciondelgobierno.gob.es</code></strong> (y al portal de la
          Sede del que depende Mercurio): para escribir esos datos en las casillas del formulario oficial.
        </li>
      </ul>
      <p>
        La extensión no solicita acceso a «todos los sitios» ni a ningún otro dominio. Todo su código va
        incluido en el paquete; <strong>no carga ni ejecuta código remoto</strong>.
      </p>

      <h2 id="uso-limitado">5. Uso limitado de los datos</h2>
      <p>
        El uso que la extensión hace de los datos cumple las condiciones de{" "}
        <em>Limited Use</em> de Google Chrome Web Store:
      </p>
      <ul>
        <li>Los datos se usan <strong>solo</strong> para prestar la función visible al usuario (rellenar el formulario de Mercurio).</li>
        <li><strong>No</strong> se venden ni se transfieren a terceros.</li>
        <li><strong>No</strong> se usan para publicidad, segmentación ni elaboración de perfiles.</li>
        <li><strong>Ninguna persona</strong> de Aproba lee estos datos a través de la extensión: nunca los recibimos.</li>
      </ul>

      <h2 id="conservacion">6. Conservación y eliminación</h2>
      <p>
        Los datos permanecen en el almacenamiento local del navegador hasta que se sustituyen por los del
        siguiente expediente o hasta que los eliminas. Puedes borrarlos en cualquier momento{" "}
        <strong>desinstalando la extensión</strong> o limpiando los datos del navegador. Como Aproba nunca
        recibe estos datos a través de la extensión, no conservamos ninguna copia por este medio.
      </p>

      <h2 id="responsable">7. Responsabilidad y contacto</h2>
      <p>
        Los datos del solicitante pertenecen al expediente que gestiona el despacho profesional usuario de
        Aproba, que es el <strong>responsable del tratamiento</strong> de los datos de sus clientes (véase
        la <Link href="/legal/privacidad">Política de privacidad</Link> y el{" "}
        <Link href="/legal/dpa">DPA</Link>). La extensión es una herramienta que ese profesional utiliza en
        su propio equipo para no teclear los datos a mano.
      </p>
      <ul>
        <li><strong>Editor de la extensión:</strong> {TITULAR.nombreComercial} ({TITULAR.web}).</li>
        <li>
          <strong>Contacto en materia de privacidad:</strong>{" "}
          <a href={`mailto:${TITULAR.emailPrivacidad}`}>{TITULAR.emailPrivacidad}</a>
        </li>
      </ul>
      <p>
        Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y
        portabilidad en los términos de la{" "}
        <Link href="/legal/privacidad">Política de privacidad</Link>. Si tu autoridad de control es la
        española, puedes reclamar ante la{" "}
        <a href={AEPD.web} target="_blank" rel="noopener noreferrer">{AEPD.nombre}</a>.
      </p>

      <h2 id="cambios">8. Cambios</h2>
      <p>
        Podemos actualizar esta política para reflejar cambios en la extensión o en la normativa.
        Publicaremos la versión vigente en esta página, indicando la fecha de última actualización.
      </p>
    </article>
  );
}
