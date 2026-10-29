// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { takeWindow } from "./text-window";

/**
 * A reader that follows the cursor the two file readers hand out: it asks for a window, keeps the
 * text and comes back with `line`/`char` until the window says there is no more. What it collects
 * has to be the text it started from — separators included, because a line boundary that goes
 * missing turns the last row of a window and the first of the next one into a single row.
 */
function readAll(text: string, limit: number, budget: number): string {
  const lines = text.split("\n");
  let line = 1;
  let char = 0;
  let out = "";
  for (let i = 0; i < 10_000; i++) {
    const w = takeWindow(lines, line, char, limit, budget);
    out += w.text;
    if (!w.more) return out;
    if (w.line === line && w.char === char) throw new Error("el cursor no avanza");
    line = w.line;
    char = w.char;
  }
  throw new Error("el lector no terminó en 10 000 ventanas");
}

/** A CSV of the size that makes a window cut at the line cap: 3 005 rows, ~66 000 characters. */
const csv = Array.from({ length: 3005 }, (_, i) => `fila,${i + 1},2026-08-01,x`).join("\n");

describe("takeWindow al recomponer el texto", () => {
  it("devuelve el texto entero, saltos de línea incluidos, cuando la ventana se corta por el tope de líneas", () => {
    // 2 000 líneas por ventana y presupuesto de sobra: solo manda el tope de líneas.
    expect(readAll(csv, 2000, 200_000)).toBe(csv);
  });

  it("devuelve el texto entero con un tope de una sola línea por ventana", () => {
    const text = "aa\nbb\ncc";
    expect(readAll(text, 1, 100)).toBe(text);
  });

  it("devuelve el texto entero cuando el presupuesto de caracteres es el que corta", () => {
    // El presupuesto de Drive: corta cada pocas líneas, y casi siempre dentro de una.
    expect(readAll(csv, 2000, 20_000)).toBe(csv);
  });
});

describe("takeWindow al cortar entre líneas", () => {
  // 914 líneas enteras son 19 999 caracteres; la 915 se pasa de los 20 000.
  const whole = Array.from({ length: 914 }, (_, i) => `fila,${i + 1},2026-08-01,x`).join("\n");

  it("no añade un salto de línea que no está en el texto ni lo marca como truncado", () => {
    const w = takeWindow(csv.split("\n"), 1, 0, 2000, 20_000);
    expect(w.text).toBe(whole);
    expect(w.text.endsWith("\n")).toBe(false);
    expect(w.truncated).toBe(false);
    expect(w.more).toBe(true);
    expect(w.line).toBe(915);
    expect(w.char).toBe(0);
  });

  it("sigue marcando truncado el corte que parte una línea por la mitad", () => {
    const w = takeWindow(["x".repeat(50), "y"], 1, 0, 10, 10);
    expect(w.text).toBe("x".repeat(10));
    expect(w.truncated).toBe(true);
    expect(w.more).toBe(true);
    expect(w.line).toBe(1);
    expect(w.char).toBe(10);
  });
});

/** La primera mitad de pareja suelta (alta sin su baja, o baja sin su alta); -1 si no hay ninguna. */
function loneSurrogateAt(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return i;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return i;
  }
  return -1;
}

describe("takeWindow con caracteres fuera del plano básico", () => {
  // Un emoji ocupa dos unidades UTF-16 y el presupuesto se mide en unidades, así
  // que un corte de 5 cae entre las dos mitades del tercero. La ventana es el
  // texto que se le entrega al modelo (lector de ficheros, de Drive y de CSV), y
  // un suplente suelto se lee como un carácter roto: la ventana no puede acabar
  // en \uD83D ni la siguiente empezar por \uDE00.
  const emoji = "😀".repeat(10);

  it("no parte un par suplente al cortar dentro de la línea", () => {
    const w = takeWindow([emoji], 1, 0, 1, 5);
    expect(loneSurrogateAt(w.text)).toBe(-1);
    expect(w.text).toBe("😀😀");
    expect(w.char).toBe(4);
    expect(w.truncated).toBe(true);
    expect(w.more).toBe(true);
  });

  it("la ventana siguiente arranca en una frontera de carácter, no en media pareja", () => {
    const w = takeWindow([emoji], 1, 0, 1, 5);
    const next = takeWindow([emoji], w.line, w.char, 1, 5);
    expect(loneSurrogateAt(next.text)).toBe(-1);
    expect(next.text).toBe("😀😀");
    expect(next.char).toBe(8);
  });

  it("recompone el texto con emojis ventana a ventana, sin perder ni repetir nada", () => {
    expect(readAll(emoji, 1, 5)).toBe(emoji);
    expect(readAll(`${emoji}\n${emoji}`, 1, 3)).toBe(`${emoji}\n${emoji}`);
    // El corte que cae justo en la frontera no se mueve: cuatro unidades son dos emojis.
    expect(takeWindow([emoji], 1, 0, 1, 4).text).toBe("😀😀");
  });

  it("con presupuesto de una unidad entrega el carácter entero, nunca una ventana vacía", () => {
    // El carácter cuesta dos unidades, así que echarse atrás del todo dejaría la ventana vacía y
    // el cursor quieto: se lleva el carácter completo (una unidad de más) y el lector avanza.
    const w = takeWindow([emoji], 1, 0, 1, 1);
    expect(w.text).toBe("😀");
    expect(loneSurrogateAt(w.text)).toBe(-1);
    expect(w.char).toBe(2);
    expect(w.more).toBe(true);
    expect(readAll(emoji, 1, 1)).toBe(emoji);
  });

  it("recompone el texto con emojis y finales de línea de Windows", () => {
    const text = `hola\r\n${emoji}\r\n${emoji}\r\nfin`;
    expect(readAll(text, 1, 3)).toBe(text);
    expect(readAll(text, 2, 5)).toBe(text);
  });
});
