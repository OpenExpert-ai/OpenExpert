// SPDX-License-Identifier: MIT
// What a regular expression costs.
//
// A pattern that backtracks catastrophically does not fail: it freezes the
// process, and the injection gate runs on the main thread for every message of
// the conversation. The criterion here is not the *shape* of the pattern but
// its **cost**: how long it needs against an adversarial input. A form nobody
// thought of is then caught by its behaviour and not by its spelling, which is
// what a detector that lists shapes cannot do — it left three holes in a row
// before this one.
//
// The measurement runs inside a `vm` context because that is the only way to
// interrupt a match that does not come back: the timeout of the context cuts
// the regex off and the process survives. A `worker_threads` worker would do
// it too, but it costs about twenty milliseconds per measurement instead of
// one, and the gate answers on the request thread.

import { runInNewContext } from "node:vm";

/**
 * Characters of the adversarial input. The engine needs few of them to blow
 * up — a dozen is enough for the patterns that freeze the app — and the
 * legitimate ones cost a millisecond against this length, so the two are far
 * apart.
 */
const PROBE_LENGTH = 256;

/** The most characters of the pattern itself that the probe is built from. */
const PATTERN_PROBE_CHARS = 3;

/**
 * Characters always tried, whatever the pattern uses. A pattern that only
 * costs something on digits (`\d+\d+\d+\d+\d+\d+x`) or on whitespace
 * (`\s+\s+\s+\s+\s+x`) never receives them from its own atoms alone, so they
 * are reserved here instead of left to the letters that come after.
 */
const ALWAYS_CHARS = ["0", " "];

/**
 * A pattern that needs more than this against the probe is too slow. The
 * limit is generous: the patterns an owner writes legitimately cost a
 * millisecond or two against this input, and the ones that freeze the process
 * need seconds. It is left wide on purpose — the CI runner is about six
 * times slower than a developer machine, and a legitimate pattern must not be
 * rejected for being slow.
 */
export const PATTERN_COST_LIMIT_MS = 100;

/**
 * The probe is abandoned after this long. A pattern that reaches it is
 * already too slow, and cutting it off is what keeps the measurement itself
 * from freezing the process that asked for it.
 */
const PROBE_TIMEOUT_MS = 150;

/** Characters tried when the pattern does not use any letter. */
const FALLBACK_CHARS = ["a", "b", "c"];

/** Characters used to break the end of the probe, in this order. */
const BREAKER_CHARS = ["#", "~", "!", "@", "%", "^", "&", "\u0001"];

/** The character an escape matches. */
function escapedChar(pattern: string, i: number): { char: string; end: number } {
  const next = pattern[i + 1] ?? "";
  switch (next) {
    case "d":
      return { char: "0", end: i + 2 };
    case "w":
      return { char: "a", end: i + 2 };
    case "s":
      return { char: " ", end: i + 2 };
    case "D":
    case "W":
    case "S":
      return { char: "a", end: i + 2 };
    case "b":
    case "B":
      return { char: "", end: i + 2 }; // Zero width.
    case "n":
      return { char: "\n", end: i + 2 };
    case "t":
      return { char: "\t", end: i + 2 };
    case "r":
      return { char: "\r", end: i + 2 };
    default:
      return { char: next, end: i + 2 };
  }
}

/** The character a class matches: one it lists, or one it does not. */
function classChar(pattern: string, i: number, absent: string): { char: string; end: number } {
  const end = pattern.indexOf("]", i);
  if (end < 0) return { char: "", end: i + 1 };
  const body = pattern.slice(i + 1, end);
  if (body.startsWith("^")) {
    const listed = body.slice(1);
    const free = FALLBACK_CHARS.find((c) => !listed.includes(c)) ?? absent;
    return { char: free, end: end + 1 };
  }
  return { char: body[0] ?? "", end: end + 1 };
}

/** Where a group ends, and the character of its first atom. */
function groupChar(pattern: string, i: number, absent: string): { char: string; end: number } {
  let depth = 0;
  let k = i;
  for (; k < pattern.length; k++) {
    if (pattern[k] === "\\") {
      k++;
      continue;
    }
    if (pattern[k] === "(") depth++;
    else if (pattern[k] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  const close = k < pattern.length ? k : pattern.length - 1;
  let inner = pattern.slice(i + 1, close);
  if (inner.startsWith("?")) {
    const prefix = /^\?(?:[:=!]|<[A-Za-z_][A-Za-z0-9_]*>)/.exec(inner);
    inner = inner.slice(prefix ? prefix[0].length : 1);
  }
  if (!inner) return { char: "", end: close + 1 };
  return { char: firstChar(inner, absent), end: close + 1 };
}

/** The first character the fragment can match. */
function firstChar(fragment: string, absent: string): string {
  const ch = fragment[0];
  if (ch === undefined) return "";
  if (ch === "\\") return escapedChar(fragment, 0).char;
  if (ch === "[") return classChar(fragment, 0, absent).char;
  if (ch === "(") return groupChar(fragment, 0, absent).char;
  if (ch === ".") return absent; // A wildcard matches whatever is not there.
  return ch;
}

/**
 * The characters the pattern can consume, one per atom: an escape gives the
 * character it matches (`\d` a digit, `\w` a letter, `\s` a space), a class one
 * it lists —or one it does not, when negated—, a group the character of its
 * first atom, and a literal gives itself, accents included. Anchors and
 * quantifiers are not characters, so they are skipped; the bounds of an
 * interval (`{9,15}`) are skipped with the interval.
 */
function atomChars(pattern: string): string[] {
  const out: string[] = [];
  const push = (c: string) => {
    if (c && !out.includes(c)) out.push(c);
  };
  for (let i = 0; i < pattern.length;) {
    const ch = pattern[i];
    if (ch === "\\") {
      const escaped = escapedChar(pattern, i);
      push(escaped.char);
      i = escaped.end;
      continue;
    }
    if (ch === "[") {
      const cls = classChar(pattern, i, "x");
      push(cls.char);
      i = cls.end;
      continue;
    }
    if (ch === "(") {
      const group = groupChar(pattern, i, "x");
      push(group.char);
      i = group.end;
      continue;
    }
    if (ch === "{") {
      const end = pattern.indexOf("}", i);
      i = end < 0 ? i + 1 : end + 1;
      continue;
    }
    if (
      ch &&
      ch !== "." &&
      ch !== "^" &&
      ch !== "$" &&
      ch !== "*" &&
      ch !== "+" &&
      ch !== "?" &&
      ch !== "|" &&
      ch !== ")" &&
      ch !== "}" &&
      ch !== "]"
    ) {
      push(ch);
    }
    i++;
  }
  return out;
}

/** A character the pattern does not use, to break the end of the probe. */
function absentChar(pattern: string): string {
  const used = new Set(atomChars(pattern));
  for (const c of BREAKER_CHARS) if (!used.has(c)) return c;
  for (const c of FALLBACK_CHARS) if (!used.has(c)) return c;
  return "\u0001";
}

/**
 * The characters the probe is built from.
 *
 * The engine is at its worst when two parts of the pattern compete for the
 * same characters, so the probe starts from what the pattern can consume —one
 * character per atom— and not from the ASCII letters it happens to spell: a
 * `\d` that never sees a digit, or an `ñ` that is dropped as if it were not
 * literal, is measured at zero and passed. A digit and a space are tried
 * always, since a pattern can catch only on those. A character the pattern
 * never uses is the opposite of all that, and it is the one that breaks the
 * end of the probe.
 */
function probeChars(pattern: string): string[] {
  const out: string[] = [];
  const push = (c: string) => {
    if (c && !out.includes(c)) out.push(c);
  };
  for (const c of atomChars(pattern).slice(0, PATTERN_PROBE_CHARS)) push(c);
  for (const c of ALWAYS_CHARS) push(c);
  for (const c of FALLBACK_CHARS) push(c);
  return out.slice(0, PATTERN_PROBE_CHARS + ALWAYS_CHARS.length);
}

/**
 * The inputs the pattern is tried against: the repeated character, and the
 * repeated character followed by one the pattern cannot use. The second one
 * is what makes the match fail at the end — after the engine has already
 * tried every way of splitting the input, which is when the backtracking
 * explodes.
 */
function probes(pattern: string): string[] {
  const absent = absentChar(pattern);
  const out: string[] = [];
  for (const c of probeChars(pattern)) {
    out.push(c.repeat(PROBE_LENGTH));
    out.push(c.repeat(PROBE_LENGTH) + absent);
  }
  return out;
}

/**
 * Milliseconds the pattern needs against the input, or null when it did not
 * come back inside the timeout.
 */
export function measurePattern(pattern: string, input: string): number | null {
  try {
    const result = runInNewContext(
      "const t = Date.now(); new RegExp(p, 'i').test(s); Date.now() - t;",
      { p: pattern, s: input },
      { timeout: PROBE_TIMEOUT_MS },
    ) as number;
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A pattern that does not compile is not slow: it is invalid, and the
    // caller rejects it for that.
    if (/timed out/i.test(message)) return null;
    return 0;
  }
}

/** Verdicts already given, so a pattern is measured once and not once per message. */
const verdicts = new Map<string, boolean>();

/**
 * Whether the pattern is too slow to run against a message. The verdict is
 * the measurement: the pattern is tried against inputs built to make it
 * work, and one that needs more than the limit is rejected, whatever its
 * shape.
 */
export function isPatternTooSlow(pattern: string): boolean {
  const known = verdicts.get(pattern);
  if (known !== undefined) return known;
  let tooSlow = false;
  for (const input of probes(pattern)) {
    const ms = measurePattern(pattern, input);
    if (ms === null) {
      tooSlow = true; // It did not come back in time.
      break;
    }
    if (ms > PATTERN_COST_LIMIT_MS) {
      tooSlow = true;
      break;
    }
  }
  verdicts.set(pattern, tooSlow);
  return tooSlow;
}

/** The patterns that are safe to run, in the order they came in. */
export function safePatterns(patterns: readonly string[]): string[] {
  return patterns.filter((p) => !isPatternTooSlow(p));
}
