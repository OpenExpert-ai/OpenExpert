// SPDX-License-Identifier: MIT
// The pure parts of the activity query: how a search term becomes a `LIKE`
// pattern, and what the term means for the screen.
//
// The search box used to filter the events the browser already had, so the
// term was matched in JavaScript with `toLowerCase()`. Now the term goes to
// the database, and the two have to agree: a term that means one thing in the
// browser and another in the query is a search that finds nothing (or
// everything) without saying why.

import { describe, expect, it } from "vitest";

import {
  ACTIVITY_PAGE_SIZE,
  escapeLikeTerm,
  hasTerm,
  likePattern,
  LIKE_ESCAPE,
} from "./activity-page";

describe("la página del registro", () => {
  it("tiene un tamaño de página fijo", () => {
    expect(ACTIVITY_PAGE_SIZE).toBe(40);
  });
});

describe("el término de búsqueda", () => {
  it("no es un término lo que no se ha escrito", () => {
    expect(hasTerm(undefined)).toBe(false);
    expect(hasTerm("")).toBe(false);
    expect(hasTerm("   ")).toBe(false);
    expect(hasTerm("a")).toBe(true);
    expect(hasTerm("  a  ")).toBe(true);
  });

  it("escapa los comodines de LIKE, que no son comodines aquí", () => {
    // Sin esto, buscar "100%" también encontraría "1000", y buscar "_"
    // encontraría cualquier carácter.
    expect(escapeLikeTerm("100%")).toBe(`100${LIKE_ESCAPE}%`);
    expect(escapeLikeTerm("a_b")).toBe(`a${LIKE_ESCAPE}_b`);
    expect(escapeLikeTerm("a!b")).toBe(`a${LIKE_ESCAPE}${LIKE_ESCAPE}b`);
    // Lo que no es comodín se queda como está.
    expect(escapeLikeTerm("Operaciones")).toBe("Operaciones");
  });

  it("arma el patrón con comodines alrededor y el término escapado", () => {
    expect(likePattern("100%")).toBe(`%100${LIKE_ESCAPE}%%`);
    expect(likePattern("  hola  ")).toBe("%hola%");
    // El patrón se pasa en minúsculas: el plegado de mayúsculas lo hace la
    // base de datos, y en minúsculas el término no depende de eso.
    expect(likePattern("CONFIGURACIÓN")).toBe("%configuración%");
  });
});
