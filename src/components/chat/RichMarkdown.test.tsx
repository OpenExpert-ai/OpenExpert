// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RichMarkdown } from "./RichMarkdown";

describe("RichMarkdown", () => {
  afterEach(cleanup);
  it("renders headings, bold text, lists and safe links", () => {
    render(
      <RichMarkdown text={"# Título\n\n**negrita** y [enlace](https://x.test)\n\n- uno\n- dos"} />,
    );
    expect(screen.getByText("Título")).toBeTruthy();
    expect(screen.getByText("negrita")).toBeTruthy();
    const link = screen.getByRole("link", { name: "enlace" });
    expect(link.getAttribute("href")).toBe("https://x.test");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("uno")).toBeTruthy();
    expect(screen.getByText("dos")).toBeTruthy();
  });

  it("renders tables and the streaming caret", () => {
    const { container } = render(
      <RichMarkdown streaming text={"| a | b |\n| - | - |\n| 1 | 2 |"} />,
    );
    expect(container.querySelector("table")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});
