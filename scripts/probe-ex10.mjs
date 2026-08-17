// EX-10 est un AcroForm : les cases cochées ne sont PAS du texte. On inspecte
// l'état réel des checkboxes avec pdf-lib, avant/après remplissage.
import { rellenarOficial } from "../lib/ex-forms.ts";
import { PDFDocument } from "pdf-lib";

async function cajas(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const out = {};
  for (const f of form.getFields()) {
    const n = f.getName();
    if (typeof f.isChecked === "function") { try { out[n] = f.isChecked(); } catch { out[n] = "?"; } }
  }
  return out;
}
const BASE = { apellido1: "APE1", nombre: "NOMB", nacionalidad: "NAC" };
const vacio = await cajas(await rellenarOficial("EX-10", { ...BASE }));
console.log("checkboxes du modèle EX-10 :", Object.keys(vacio).join(", ") || "(aucune)");
console.log("cochées à vide :", Object.entries(vacio).filter(([, v]) => v === true).map(([k]) => k).join(", ") || "(aucune)");

for (const valor of ["S", "C", "V", "D", "Sp"]) {
  const lleno = await cajas(await rellenarOficial("EX-10", { ...BASE, estadoCivil: valor }));
  const nuevas = Object.entries(lleno).filter(([k, v]) => v === true && vacio[k] !== true).map(([k]) => k);
  console.log(`estadoCivil="${valor}" → cochées en plus : ${nuevas.join(", ") || "❌ AUCUNE"}`);
}
// et le sexe, pour comparer (lui est réputé marcher)
for (const valor of ["H", "M"]) {
  const lleno = await cajas(await rellenarOficial("EX-10", { ...BASE, sexo: valor }));
  const nuevas = Object.entries(lleno).filter(([k, v]) => v === true && vacio[k] !== true).map(([k]) => k);
  console.log(`sexo="${valor}" → cochées en plus : ${nuevas.join(", ") || "❌ AUCUNE"}`);
}
