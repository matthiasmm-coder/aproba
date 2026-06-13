import type { Metadata } from "next";
import Link from "next/link";
import { TITULAR, ULTIMA_ACTUALIZACION, COOKIES } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de cookies" };

export default function Cookies() {
  return (
    <article className="legal-prose">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Última actualización: {ULTIMA_ACTUALIZACION}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">Política de cookies</h1>
      <p>
        Una cookie es un pequeño archivo que un sitio web guarda en tu navegador. {TITULAR.nombreComercial}{" "}
        utiliza <strong>únicamente cookies técnicas necesarias</strong> para el funcionamiento de la
        plataforma. No usamos cookies de publicidad ni de seguimiento de terceros.
      </p>

      <h2 id="tipos">1. Cookies que utilizamos</h2>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Titular</th>
            <th>Finalidad</th>
            <th>Duración</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {COOKIES.map((c) => (
            <tr key={c.nombre}>
              <td><code>{c.nombre}</code></td>
              <td>{c.titular}</td>
              <td>{c.finalidad}</td>
              <td>{c.duracion}</td>
              <td>{c.tipo}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="consentimiento">2. Consentimiento</h2>
      <p>
        Conforme al artículo 22.2 de la LSSI-CE, las cookies técnicas estrictamente necesarias para prestar el
        servicio expresamente solicitado por el usuario están <strong>exentas de consentimiento</strong>. Por
        ello no mostramos un banner de consentimiento, sino un breve aviso informativo. Si en el futuro
        incorporamos cookies analíticas o de terceros, solicitaremos tu consentimiento previo mediante un
        gestor de cookies.
      </p>

      <h2 id="gestion">3. Cómo gestionar o eliminar cookies</h2>
      <p>
        Puedes configurar o eliminar las cookies desde los ajustes de tu navegador. Ten en cuenta que
        desactivar las cookies técnicas impedirá iniciar sesión y usar la plataforma. Enlaces de ayuda:
      </p>
      <ul>
        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
        <li><a href="https://support.mozilla.org/es/kb/Borrar%20cookies" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
        <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
        <li><a href="https://support.microsoft.com/es-es/microsoft-edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
      </ul>

      <h2 id="mas">4. Más información</h2>
      <p>
        Para saber cómo tratamos tus datos personales, consulta la{" "}
        <Link href="/legal/privacidad">Política de privacidad</Link>.
      </p>
    </article>
  );
}
