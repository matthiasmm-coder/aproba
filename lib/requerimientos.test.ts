import { describe, it, expect } from "vitest";
import {
  sumarDiasHabiles, diasRestantes, urgenciaDe, etiquetaPlazo, ordenarPorUrgencia,
  hitosAviso, avisoPendiente, AVISAR_DIAS_DEFECTO, PLAZO_HABITUAL_DIAS,
} from "./requerimientos";

const HOY = new Date(2026, 8, 21); // lunes 21/09/2026
const enDias = (n: number) => new Date(2026, 8, 21 + n).toISOString();
const req = (o: Partial<Parameters<typeof avisoPendiente>[0]> = {}) => ({
  estado: "PENDIENTE" as const, fechaLimite: enDias(10), avisarDias: AVISAR_DIAS_DEFECTO, ultimoAviso: null, ...o,
});

describe("días hábiles (ayuda para escribir el plazo)", () => {
  it("salta sábados y domingos", () => {
    // lunes 21 + 10 hábiles = lunes 5 de octubre
    expect(sumarDiasHabiles(HOY, PLAZO_HABITUAL_DIAS).toDateString()).toBe(new Date(2026, 9, 5).toDateString());
    // viernes + 1 hábil = lunes
    expect(sumarDiasHabiles(new Date(2026, 8, 25), 1).getDay()).toBe(1);
    // sábado + 1 hábil = lunes
    expect(sumarDiasHabiles(new Date(2026, 8, 26), 1).getDay()).toBe(1);
  });
  it("0 días deja la fecha donde está", () => {
    expect(sumarDiasHabiles(HOY, 0).toDateString()).toBe(HOY.toDateString());
  });
  // Al no conocer los festivos, la fecha sale IGUAL o ANTES que la real: da prisa de más,
  // nunca de menos. Es la única dirección segura para un plazo que hace caer el expediente.
  it("nunca devuelve una fecha posterior a la que daría un calendario con festivos", () => {
    const sinFestivos = sumarDiasHabiles(HOY, 10);
    const conUnFestivo = sumarDiasHabiles(HOY, 11); // un festivo dentro del plazo lo alarga
    expect(sinFestivos.getTime()).toBeLessThan(conUnFestivo.getTime());
  });
});

describe("días restantes y urgencia", () => {
  it("cuenta en días naturales, no en horas", () => {
    expect(diasRestantes(enDias(0), HOY)).toBe(0);
    expect(diasRestantes(enDias(3), HOY)).toBe(3);
    expect(diasRestantes(enDias(-2), HOY)).toBe(-2);
    // vence hoy a las 00:00 y son las 09:00 → sigue siendo HOY, no vencido
    expect(diasRestantes(new Date(2026, 8, 21, 0, 0).toISOString(), new Date(2026, 8, 21, 9, 0))).toBe(0);
  });
  it("clasifica según el umbral que eligió la gestoría", () => {
    expect(urgenciaDe(req({ fechaLimite: enDias(-1) }), HOY)).toBe("VENCIDO");
    expect(urgenciaDe(req({ fechaLimite: enDias(0) }), HOY)).toBe("HOY");
    expect(urgenciaDe(req({ fechaLimite: enDias(2) }), HOY)).toBe("URGENTE");
    expect(urgenciaDe(req({ fechaLimite: enDias(9) }), HOY)).toBe("TRANQUILO");
    // con un umbral de 7, lo que falta a 5 días ya es PROXIMO (y no urgente)
    expect(urgenciaDe(req({ fechaLimite: enDias(5), avisarDias: 7 }), HOY)).toBe("PROXIMO");
    expect(urgenciaDe(req({ fechaLimite: enDias(2), avisarDias: 7 }), HOY)).toBe("URGENTE");
  });
  it("lo aportado sale del radar aunque la fecha haya pasado", () => {
    expect(urgenciaDe(req({ estado: "APORTADO", fechaLimite: enDias(-30) }), HOY)).toBe("APORTADO");
    expect(etiquetaPlazo(req({ estado: "APORTADO", fechaLimite: enDias(-30) }), HOY)).toBe("Aportado");
  });
  it("escribe el plazo en palabras", () => {
    expect(etiquetaPlazo(req({ fechaLimite: enDias(0) }), HOY)).toBe("Vence hoy");
    expect(etiquetaPlazo(req({ fechaLimite: enDias(1) }), HOY)).toBe("Queda 1 día");
    expect(etiquetaPlazo(req({ fechaLimite: enDias(4) }), HOY)).toBe("Quedan 4 días");
    expect(etiquetaPlazo(req({ fechaLimite: enDias(-1) }), HOY)).toBe("Venció ayer");
    expect(etiquetaPlazo(req({ fechaLimite: enDias(-3) }), HOY)).toBe("Venció hace 3 días");
  });
  it("ordena por lo que antes vence y deja lo aportado al final", () => {
    const l = ordenarPorUrgencia([
      { id: "c", estado: "APORTADO" as const, fechaLimite: enDias(-1) },
      { id: "a", estado: "PENDIENTE" as const, fechaLimite: enDias(8) },
      { id: "b", estado: "PENDIENTE" as const, fechaLimite: enDias(1) },
    ]);
    expect(l.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});

describe("cuándo se avisa al despacho", () => {
  it("los hitos bajan y no se repiten", () => {
    expect(hitosAviso(3)).toEqual([3, 1, 0, -1]);
    expect(hitosAviso(7)).toEqual([7, 3, 1, 0, -1]);
    expect(hitosAviso(1)).toEqual([1, 0, -1]);
    expect(hitosAviso(0)).toEqual([0, -1]);
  });
  it("no avisa mientras la fecha está lejos", () => {
    expect(avisoPendiente(req({ fechaLimite: enDias(10) }), HOY)).toBeNull();
  });
  it("avisa al entrar en el umbral, y solo una vez por hito", () => {
    expect(avisoPendiente(req({ fechaLimite: enDias(3) }), HOY)).toBe(3);
    expect(avisoPendiente(req({ fechaLimite: enDias(3), ultimoAviso: 3 }), HOY)).toBeNull();
    expect(avisoPendiente(req({ fechaLimite: enDias(2), ultimoAviso: 3 }), HOY)).toBeNull(); // el hito 3 ya cubre el día 2
    expect(avisoPendiente(req({ fechaLimite: enDias(1), ultimoAviso: 3 }), HOY)).toBe(1);
    expect(avisoPendiente(req({ fechaLimite: enDias(0), ultimoAviso: 1 }), HOY)).toBe(0);
  });
  it("con un umbral alto, el primer aviso es ese umbral", () => {
    expect(avisoPendiente(req({ fechaLimite: enDias(7), avisarDias: 7 }), HOY)).toBe(7);
    expect(avisoPendiente(req({ fechaLimite: enDias(5), avisarDias: 7, ultimoAviso: 7 }), HOY)).toBeNull();
    expect(avisoPendiente(req({ fechaLimite: enDias(3), avisarDias: 7, ultimoAviso: 7 }), HOY)).toBe(3);
  });
  it("avisa una vez cuando se ha pasado, y luego calla", () => {
    expect(avisoPendiente(req({ fechaLimite: enDias(-1), ultimoAviso: 0 }), HOY)).toBe(-1);
    expect(avisoPendiente(req({ fechaLimite: enDias(-1), ultimoAviso: -1 }), HOY)).toBeNull();
    expect(avisoPendiente(req({ fechaLimite: enDias(-5), ultimoAviso: 0 }), HOY)).toBeNull();
  });
  it("lo aportado no vuelve a avisar nunca", () => {
    expect(avisoPendiente(req({ estado: "APORTADO", fechaLimite: enDias(0) }), HOY)).toBeNull();
  });
  it("un requerimiento creado ya vencido avisa una vez y para", () => {
    expect(avisoPendiente(req({ fechaLimite: enDias(-1), ultimoAviso: null }), HOY)).toBe(-1);
  });
});
