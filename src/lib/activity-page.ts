// SPDX-License-Identifier: MIT
// The parts of the activity query that the browser also needs.
//
// They live apart from the query itself (`activity-query.ts`) because that one
// imports the ORM and the schema, and the screen that shows the log is a
// client route: importing the query from there would put the whole ORM in the
// browser bundle to read a constant.

/** How many events one page holds. */
export const ACTIVITY_PAGE_SIZE = 40;

/**
 * The character `LIKE` uses to escape the next one.
 *
 * It is `!` and not the backslash because a backslash has to be escaped twice
 * on its way through the SQL string, and a mistake there turns the search into
 * something that matches nothing (or everything).
 */
export const LIKE_ESCAPE = "!";

/**
 * Escapes the characters `LIKE` treats as wildcards.
 *
 * Without this a search for "100%" would also match "1000", and a search for
 * "_" would match every single character.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[!%_]/g, (c) => `${LIKE_ESCAPE}${c}`);
}

/**
 * The `LIKE` pattern of a search term: everything around it is a wildcard, and
 * the term itself is escaped so it is matched literally.
 */
export function likePattern(term: string): string {
  return `%${escapeLikeTerm(term.trim().toLowerCase())}%`;
}

/**
 * Whether a term looks like something the user typed to search for, and not
 * the empty string the screen starts with.
 */
export function hasTerm(term: string | undefined): term is string {
  return !!term && term.trim() !== "";
}
