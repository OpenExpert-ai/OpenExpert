// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parseBusinessCsv, parseCsv, parseDate, parseNumber, templateFor } from "./business-csv";

describe("parseCsv", () => {
  it("reads quoted fields, escaped quotes and a newline inside a field", () => {
    const rows = parseCsv('id,company,nota\n1,"Clínica, Sur","Primera línea\nSegunda ""cita"""');
    expect(rows[0]).toEqual(["id", "company", "nota"]);
    expect(rows[1]).toEqual(["1", "Clínica, Sur", 'Primera línea\nSegunda "cita"']);
  });

  it("accepts semicolons, as Excel writes in Spanish", () => {
    expect(parseCsv("id;empresa;valor\n1;Talleres;1.200,50")).toEqual([
      ["id", "empresa", "valor"],
      ["1", "Talleres", "1.200,50"],
    ]);
  });
});

describe("parseNumber", () => {
  it("reads Spanish and English grouping", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("1.234")).toBe(1234);
    expect(parseNumber("1234,56")).toBe(1234.56);
    expect(parseNumber("€ 840")).toBe(840);
  });

  it("falls back when the cell is not a number", () => {
    expect(parseNumber("sin dato", 7)).toBe(7);
  });
});

describe("parseDate", () => {
  it("normalises the formats a Spanish export uses", () => {
    expect(parseDate("15/11/2026")).toBe("2026-11-15");
    expect(parseDate("2026-11-15")).toBe("2026-11-15");
  });
});

describe("parseBusinessCsv", () => {
  it("maps Spanish deal headers and keeps the numbers", () => {
    const csv = [
      "id,empresa,etapa,valor,propietario,dias en etapa,fecha de cierre,estado",
      "d-1,Clínica Dental,Negociación,8.400,Ana,12,15/11/2026,open",
    ].join("\n");
    const out = parseBusinessCsv("deals", csv);
    expect(out.errors).toEqual([]);
    expect(out.rows[0]).toEqual({
      entity: "deals",
      data: {
        id: "d-1",
        company: "Clínica Dental",
        stage: "Negociación",
        value: 8400,
        owner: "Ana",
        daysInStage: 12,
        closeDate: "2026-11-15",
        status: "open",
      },
    });
  });

  it("reports the line and the missing field instead of importing a bad invoice", () => {
    const csv = ["id,cliente,importe,vencimiento", "i-1,Talleres,6800,30/09/2026"].join("\n");
    const out = parseBusinessCsv("invoices", csv);
    expect(out.errors).toEqual([]);
    expect(out.rows[0]?.entity).toBe("invoices");
    const bad = parseBusinessCsv("invoices", "id,cliente,importe\n1,Talleres,6800");
    expect(bad.rows).toEqual([]);
    expect(bad.errors[0]).toEqual({ row: 2, message: "Falta dueDate (vencimiento)." });
  });

  it("generates a stable id when the export has no id column", () => {
    const out = parseBusinessCsv("accounts", "nombre,mrr\nClínica,700");
    expect(out.rows[0]?.entity).toBe("accounts");
    if (out.rows[0]?.entity === "accounts") expect(out.rows[0].data.id).toBe("csv-accounts-1");
  });

  it("writes a header line the same parser accepts", () => {
    const headers = parseCsv(templateFor("campaigns"))[0];
    expect(headers).toEqual([
      "id",
      "name",
      "channel",
      "status",
      "spend7d",
      "conversions7d",
      "cpaTarget",
      "dailyBudget",
    ]);
  });
});

describe("parseBusinessCsv y las columnas de dinero", () => {
  it("rechaza la campaña y la cuenta con un importe ilegible, no las importa a 0", () => {
    const campaign = parseBusinessCsv(
      "campaigns",
      ["id,nombre,gasto,cpa objetivo,presupuesto diario", 'c-1,Verano,"n/d",12,30'].join("\n"),
    );
    expect(campaign.rows).toEqual([]);
    expect(campaign.errors).toEqual([
      { row: 2, message: "El campo spend7d (inversión de 7 días) no es un número: «n/d»." },
    ]);

    const account = parseBusinessCsv("accounts", ["nombre,mrr", "Clínica,pendiente"].join("\n"));
    expect(account.rows).toEqual([]);
    expect(account.errors).toEqual([
      { row: 2, message: "El campo mrr (MRR) no es un número: «pendiente»." },
    ]);
  });

  it("lee el importe de una factura escrito en español y rechaza el que no lo es", () => {
    const ok = parseBusinessCsv(
      "invoices",
      ["id,cliente,importe,vencimiento", 'i-1,Sur,"1.234,56",30/09/2026'].join("\n"),
    );
    expect(ok.errors).toEqual([]);
    const amount = ok.rows.flatMap((r) => (r.entity === "invoices" ? [r.data.amount] : []));
    expect(amount).toEqual([1234.56]);

    const bad = parseBusinessCsv(
      "invoices",
      ["id,cliente,amount,vencimiento", 'i-1,Sur,"1.234,56 (IVA)",30/09/2026'].join("\n"),
    );
    expect(bad.rows).toEqual([]);
    expect(bad.errors[0]?.row).toBe(2);
    expect(bad.errors[0]?.message).toMatch(/importe|amount/i);
  });

  it("deja pasar 0 cuando la celda de dinero viene vacía", () => {
    const out = parseBusinessCsv("campaigns", ["id,nombre,gasto", "c-1,Verano,"].join("\n"));
    expect(out.errors).toEqual([]);
    const spend = out.rows.flatMap((r) => (r.entity === "campaigns" ? [r.data.spend7d] : []));
    expect(spend).toEqual([0]);
  });
});
