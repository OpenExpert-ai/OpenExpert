// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { renderErrorPage } from "./error-page";

describe("renderErrorPage", () => {
  it("renders a complete spanish fallback document without a reference", () => {
    const html = renderErrorPage();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("<title>La página no se pudo cargar</title>");
    expect(html).toContain("Esta página no se pudo cargar");
    expect(html).toContain('onclick="location.reload()"');
    expect(html).toContain('href="/"');
    // No reference paragraph when none is supplied.
    expect(html).not.toContain('class="ref"');
    expect(html).not.toContain("Referencia:");
  });

  it("includes the reference id when one is given", () => {
    const html = renderErrorPage("abc-123");
    expect(html).toContain('class="ref"');
    expect(html).toContain("Referencia:");
    expect(html).toContain("<code>abc-123</code>");
  });

  it("escapes HTML-special characters in the reference", () => {
    const html = renderErrorPage(`<script>alert("x")</script>&'`);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
  });

  it("treats an empty reference as absent", () => {
    expect(renderErrorPage("")).not.toContain("Referencia:");
  });
});
