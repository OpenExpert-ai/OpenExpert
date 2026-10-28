// SPDX-License-Identifier: MIT
// «Días en etapa» es un recuento de días de calendario, no de bloques de 24
// horas: un deal que cambió ayer lleva un día en la etapa a cualquier hora de
// hoy. El umbral de estancados del resumen («>21 días») se lee con el mismo
// número, así que un día de menos también retrasa el aviso.
import { describe, expect, it } from "vitest";
import { mapPipedriveDeal } from "./connectors";

/** Índice del día local, la cuenta que no depende del huso ni del cambio de hora. */
function dayIndex(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/** Días de calendario que el usuario cuenta entre el cambio y hoy. */
function calendarDays(now: Date, stamp: Date): number {
  return Math.max(0, dayIndex(now) - dayIndex(stamp));
}

/** El texto que manda Pipedrive: la hora UTC sin zona, sin milisegundos. */
function pipedriveTime(instant: Date): string {
  return instant.toISOString().replace("T", " ").slice(0, 19);
}

function daysInStage(stageChangeTime: string | null, now: Date): number | undefined {
  const row = mapPipedriveDeal(
    {
      id: 1,
      title: "Deal",
      org_name: "Clínica Sur",
      stage_id: 1,
      stage_change_time: stageChangeTime,
    },
    new Map([["1", "Demo"]]),
    now,
  );
  return row?.daysInStage;
}

const HOUR = 3_600_000;

describe("días en etapa de un deal del CRM", () => {
  it("un cambio de ayer son 1 día, aunque no hayan pasado 24 horas", () => {
    const now = new Date(2026, 9, 28, 9, 0, 0);
    const stamp = new Date(now.getTime() - 23 * HOUR);
    expect(daysInStage(pipedriveTime(stamp), now)).toBe(1);
    expect(daysInStage(pipedriveTime(stamp), now)).toBe(calendarDays(now, stamp));
  });

  it("un cambio de anteayer son 2 días, aunque no hayan pasado 48 horas", () => {
    const now = new Date(2026, 9, 28, 9, 0, 0);
    const stamp = new Date(now.getTime() - 47 * HOUR);
    expect(daysInStage(pipedriveTime(stamp), now)).toBe(2);
    expect(daysInStage(pipedriveTime(stamp), now)).toBe(calendarDays(now, stamp));
  });

  it("la hora del proveedor se lee como el instante que es, también con zona explícita", () => {
    const now = new Date(2026, 9, 28, 9, 0, 0);
    const zulu = "2026-10-27T22:00:00Z";
    const offset = "2026-10-27T22:00:00+02:00";
    expect(daysInStage(zulu, now)).toBe(calendarDays(now, new Date(zulu)));
    expect(daysInStage(offset, now)).toBe(calendarDays(now, new Date(offset)));
    expect(daysInStage(offset, now)).toBe(calendarDays(now, new Date("2026-10-27T20:00:00Z")));
  });

  it("sin fecha, con basura o con una fecha futura son 0 días", () => {
    const now = new Date(2026, 9, 28, 9, 0, 0);
    expect(daysInStage(null, now)).toBe(0);
    expect(daysInStage("ayer por la tarde", now)).toBe(0);
    expect(daysInStage(pipedriveTime(new Date(now.getTime() + 5 * HOUR)), now)).toBe(0);
  });

  it("el deal que pasa de 21 días y 23 horas cuenta como estancado", () => {
    const now = new Date(2026, 9, 28, 9, 0, 0);
    const stamp = new Date(now.getTime() - (21 * 24 + 23) * HOUR);
    const days = daysInStage(pipedriveTime(stamp), now);
    expect(days).toBe(22);
    expect(days! > 21).toBe(true);
  });
});
