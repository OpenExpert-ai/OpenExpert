// SPDX-License-Identifier: MIT
// El separador de un CSV no se decide contando comas en la cabecera.
//
// `parseCsv` (business-csv.ts) parte la PRIMERA línea por cada candidato y se
// queda con el que más trozos da, sin mirar si el separador está dentro de un
// campo entrecomillado. Cuando un fichero separado por `;` lleva en su cabecera
// una celda entrecomillada con tantas comas como separadores tiene la tabla, el
// empate lo gana la coma (es el primer candidato) y el fichero entero se parte
// por comas: las columnas dejan de existir y todas las filas se rechazan con
// «Falta client (cliente)», un motivo que el fichero no tiene.
//
// El lector de archivos locales ya lo hace bien (`detectDelimiter`,
// local-fs.server.ts): parte los primeros registros de cada candidato, cuenta
// solo los separadores fuera de comillas y exige que la tabla más ancha se
// repita en al menos la mitad de los registros. El mismo fichero que
// `read_local_file` describe con cuatro columnas es el que la importación
// rechaza entero, y las dos rutas leen el mismo CSV.

import { describe, expect, it } from "vitest";
import { parseBusinessCsv } from "./business-csv";

/** Separado por `;`, con una columna de notas cuya cabecera lleva tres comas. */
const SEMICOLON_WITH_QUOTED_COMMAS = [
  'Cliente;Importe;Vencimiento;"Notas, a, b, c"',
  'Pérez, S.L.;1200,50;01/02/2026;"llamar, el lunes, por la tarde"',
  'Ruiz, Hnos;980,00;15/03/2026;"pagada, no reclamar"',
  "",
].join("\n");

describe("separador del CSV en la importación", () => {
  it("importa un fichero con ';' cuya cabecera entrecomillada lleva comas", () => {
    const parsed = parseBusinessCsv("invoices", SEMICOLON_WITH_QUOTED_COMMAS);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({
      entity: "invoices",
      data: {
        id: "csv-invoices-1",
        client: "Pérez, S.L.",
        amount: 1200.5,
        dueDate: "2026-02-01",
        status: "open",
        reminders: 0,
      },
    });
    expect(parsed.rows[1]).toMatchObject({
      data: { client: "Ruiz, Hnos", amount: 980, dueDate: "2026-03-15" },
    });
  });

  it("sigue leyendo un fichero separado por comas", () => {
    const parsed = parseBusinessCsv(
      "invoices",
      "id,client,amount,dueDate,status\n1,Cliente Uno,1200.50,2026-02-01,open\n",
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      data: { client: "Cliente Uno", amount: 1200.5, dueDate: "2026-02-01" },
    });
  });

  it("una sola columna sigue siendo una sola columna", () => {
    const parsed = parseBusinessCsv("campaigns", "Nombre\nCampaña de otoño\n");

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ data: { name: "Campaña de otoño" } });
  });
});
