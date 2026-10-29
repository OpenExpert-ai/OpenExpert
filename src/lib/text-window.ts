// SPDX-License-Identifier: MIT
// A read window over a text already split in lines. It is shared by the two readers that can
// return more text than fits in one answer — a local file and a Drive document — so both hand the
// model the same cursor: the line where the next read starts and, when the cut fell inside a line,
// the character inside it.

/** A slice of the text plus the point where the next read has to resume. */
export type TextWindow = {
  text: string;
  line: number;
  char: number;
  more: boolean;
  truncated: boolean;
};

/**
 * How many UTF-16 units to take from `from` so the slice ends on a character boundary.
 *
 * The budget is counted in UTF-16 units, because that is what the context costs, but a character
 * outside the basic plane (any emoji, CJK of plane 1) is two units: a cut between the two halves
 * of the pair leaves a lone surrogate at the end of the window and its twin at the start of the
 * next one, so the model reads a broken character on both sides of every boundary. The cut backs
 * off to the boundary; and when backing off would leave nothing to take — the room was one unit
 * and the character costs two — it takes the whole character instead, because one unit over
 * budget beats half a character and the cursor still moves, so the window is neither empty nor a
 * repeat of the one before.
 */
function wholeChars(text: string, from: number, want: number): number {
  // At least one unit — a cut that takes nothing would leave the cursor still — and never past
  // the end of the line, which is always a boundary.
  const cut = Math.min(Math.max(want, 1), text.length - from);
  const before = text.charCodeAt(from + cut - 1);
  const after = text.charCodeAt(from + cut);
  const splitsPair = before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
  if (!splitsPair) return cut;
  return cut > 1 ? cut - 1 : cut + 1;
}

/**
 * The longest slice of the text that starts at `line` (1-based) and character `char` (0-based,
 * inside that line), takes at most `limit` lines and at most `budget` characters, plus the point
 * where the next read has to resume.
 *
 * The two caps are measured in different units on purpose — lines are what a person counts,
 * characters are what the context can hold — but they have to be reconciled at the same cursor.
 * When one line is bigger than the budget, the character cap decides, and only a cursor *inside*
 * the line lets the caller reach the rest.
 */
export function takeWindow(
  lines: string[],
  line: number,
  char: number,
  limit: number,
  budget: number,
): TextWindow {
  let text = "";
  let ln = line;
  let ch = char;
  let whole = 0;
  // A window that starts at the beginning of a line other than the first one opens with the
  // newline that separates it from the line before. The previous window stopped short of it, so
  // this is the only place the caller can get it from: without it, the last row of one window and
  // the first row of the next read as a single row.
  let sep = line > 1 && char === 0 ? 1 : 0;
  for (;;) {
    if (ln > lines.length) return { text, line: ln, char: 0, more: false, truncated: false };
    if (whole >= limit) return { text, line: ln, char: ch, more: true, truncated: false };
    const cur = lines[ln - 1] ?? "";
    if (ch > cur.length) ch = cur.length;
    // The newline that separates this line from the piece before it costs a character too.
    const room = budget - text.length - sep;
    const rest = cur.length - ch;
    if (room < rest) {
      const take = Math.max(0, room);
      // Nothing of this line fits and the lines before it already fill the budget: the window ends
      // at the line boundary. The separator is not emitted here (the next window opens with it), so
      // the text does not end in a newline the source does not have there; and the cut did not
      // split a line, so it is not `truncated`.
      if (take === 0 && text.length > 0) {
        return { text, line: ln, char: ch, more: true, truncated: false };
      }
      // A cut that takes no room at all still has to move the cursor, or the caller would ask for
      // the same window forever. Either way it lands on a character boundary: half a surrogate pair
      // is not text, it is a broken character at both edges of the cut.
      const got = wholeChars(cur, ch, take > 0 ? take : Math.min(1, rest));
      return {
        text: text + (sep ? "\n" : "") + cur.slice(ch, ch + got),
        line: ln,
        char: ch + got,
        more: true,
        truncated: true,
      };
    }
    text += (sep ? "\n" : "") + cur.slice(ch);
    whole++;
    ch = 0;
    ln++;
    sep = 1;
  }
}
