// SPDX-License-Identifier: MIT
// Reading a CSV from its text: its records and its separator. Pure on purpose
// (no node:fs, no server imports) so the CSV importer and the local file
// reader share one rule instead of each deciding the separator its own way.

/**
 * Delimiters the shape is read with, in the order that settles a tie: a plain comma file keeps
 * behaving exactly as it did before this list existed.
 */
export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;

/** How much of the file the delimiter is read from. The rows themselves are parsed in full. */
export const CSV_SAMPLE_CHARS = 8_000;

/**
 * Splits CSV text into records. A quoted cell may hold the delimiter and line breaks, and `""`
 * inside one is a literal quote, so counting lines or splitting on the delimiter gives the wrong
 * table: an address written on two lines inflates the row count and `"cliente, nombre"` invents a
 * column. A blank line is not a record; a quoted empty cell is.
 */
export function csvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let sawQuote = false;
  const endRecord = () => {
    const blank = !sawQuote && cells.length === 0 && cell.trim() === "";
    cells.push(cell);
    if (!blank) records.push(cells);
    cells = [];
    cell = "";
    sawQuote = false;
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      sawQuote = true;
      cell = "";
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
    } else cell += ch;
  }
  if (quoted || cells.length > 0 || cell !== "") endRecord();
  return records;
}

/**
 * Which separator the text uses, read from the text itself. A CSV *is* its rows, and the extension
 * says nothing about the separator: Excel with a Spanish locale writes `;` (the system list
 * separator) and numbers with a decimal comma. So each candidate splits the first records and the
 * widest table that repeats across them wins; a candidate has to cover at least half the records,
 * which is what leaves a one-column file as one column. Only separators outside quotes count, so
 * `"cliente, nombre"` stays a single cell. `null` when no candidate gives a table.
 */
export function detectDelimiter(text: string): string | null {
  const sample = text.slice(0, CSV_SAMPLE_CHARS);
  let best: { delimiter: string; columns: number; share: number } | null = null;
  for (const delimiter of CSV_DELIMITERS) {
    const records = csvRecords(sample, delimiter);
    if (records.length === 0) continue;
    const tally = new Map<number, number>();
    for (const record of records) tally.set(record.length, (tally.get(record.length) ?? 0) + 1);
    let columns = 0;
    let repeats = 0;
    for (const [count, times] of tally)
      if (count > columns || (count === columns && times > repeats)) {
        columns = count;
        repeats = times;
      }
    const share = repeats / records.length;
    if (columns < 2 || share < 0.5) continue;
    if (!best || columns > best.columns || (columns === best.columns && share > best.share))
      best = { delimiter, columns, share };
  }
  return best?.delimiter ?? null;
}
