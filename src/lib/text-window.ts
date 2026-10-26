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
      // the same window forever.
      const got = take > 0 ? take : Math.min(1, rest);
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
