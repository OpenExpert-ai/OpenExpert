// SPDX-License-Identifier: MIT
// La regla que lee un CSV de su propio texto: registros y separador.
//
// Vive en un módulo puro porque la usan dos rutas que antes decidían por su
// cuenta: el importador (`business-csv.ts`) y el lector de archivos locales
// (`local-fs.server.ts`). Contar separadores en la primera línea sin mirar las
// comillas partía mal un fichero separado por `;` cuya cabecera entrecomillada
// llevaba comas; el lector, con esta regla, describía el mismo fichero bien.
import { describe, expect, it } from "vitest";
import { csvRecords, detectDelimiter } from "./csv-text";

describe("detectDelimiter", () => {
  it("no cuenta los separadores que están dentro de comillas", () => {
    expect(detectDelimiter('"a,b";c\n"d,e";f\n')).toBe(";");
  });

  it("en empate gana la coma, para que un fichero normal no cambie de forma", () => {
    expect(detectDelimiter("a,b;c\nd,e;f\n")).toBe(",");
  });

  it("un fichero de una sola columna no tiene separador", () => {
    expect(detectDelimiter("Nombre\nCampaña de otoño\n")).toBeNull();
  });

  it("reconoce el tabulador y la barra vertical", () => {
    expect(detectDelimiter("a\tb\nc\td\n")).toBe("\t");
    expect(detectDelimiter("a|b\nc|d\n")).toBe("|");
  });

  it("no decide con una sola línea: la tabla tiene que repetirse en la mitad de los registros", () => {
    // Solo la segunda línea lleva comas; el resto es una columna, así que la
    // anchura 2 no cubre la mitad y el separador bueno es el punto y coma.
    expect(detectDelimiter("uno;dos\ntres,cuatro;cinco\nseis;siete\n")).toBe(";");
  });

  it("una celda entrecomillada con salto de línea sigue siendo una celda", () => {
    expect(detectDelimiter('"Calle\nMayor";Madrid\n"Atocha";Madrid\n')).toBe(";");
  });
});

describe("csvRecords", () => {
  it("respeta el separador y los saltos de línea entre comillas", () => {
    expect(csvRecords('"a;b\nc";d\ne;f\n', ";")).toEqual([
      ["a;b\nc", "d"],
      ["e", "f"],
    ]);
  });

  it("una comilla doble dentro de un campo es una comilla literal", () => {
    expect(csvRecords('"dice ""hola""";x\n', ";")).toEqual([['dice "hola"', "x"]]);
  });

  it("una línea en blanco no es un registro, pero una celda vacía entrecomillada sí", () => {
    expect(csvRecords('a;b\n\n"";c\n', ";")).toEqual([
      ["a", "b"],
      ["", "c"],
    ]);
  });
});
