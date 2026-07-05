// Extrae TODAS las claves traducibles del portal (namespaceadas) con su texto es/en.
// Uso: node --loader ./scripts/ts-loader.mjs scripts/i18n-extract.mjs > /tmp/i18n.json
import { UI, FIELD_LABELS, GRUPO_LABELS, PARENTESCO_LABELS, SEXO_LABELS, ESTADO_CIVIL_LABELS, SERVICIO_I18N, DOC_I18N } from "../lib/portal-i18n.ts";

const out = {};
const add = (ns, k, tr) => { if (tr?.es !== undefined) out[`${ns}:${k}`] = { es: tr.es, en: tr.en ?? "" }; };
for (const [k, tr] of Object.entries(UI)) add("ui", k, tr);
for (const [k, tr] of Object.entries(FIELD_LABELS)) add("field", k, tr);
for (const [k, tr] of Object.entries(GRUPO_LABELS)) add("grupo", k, tr);
for (const [k, tr] of Object.entries(PARENTESCO_LABELS)) add("parentesco", k, tr);
for (const [k, tr] of Object.entries(SEXO_LABELS)) add("sexo", k, tr);
for (const [k, tr] of Object.entries(ESTADO_CIVIL_LABELS)) add("estadoCivil", k, tr);
for (const [k, v] of Object.entries(SERVICIO_I18N)) { add("servicio", `${k}.label`, v.label); add("servicio", `${k}.desc`, v.desc); }
for (const [k, v] of Object.entries(DOC_I18N)) { add("doc", `${k}.label`, v.label); add("doc", `${k}.help`, v.help); }
console.log(JSON.stringify(out, null, 1));
