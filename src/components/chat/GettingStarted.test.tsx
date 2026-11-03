// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GettingStarted } from "./GettingStarted";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (text: string) => text }) }));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

it("lets the owner hide the guide, keeps it hidden in a new chat and reopen it", () => {
  const { unmount } = render(<GettingStarted hasBusinessData={false} hasMessages={false} />);
  expect(screen.getByRole("link", { name: "Configurar" }).getAttribute("href")).toBe(
    "/settings/ai",
  );
  expect(screen.getByRole("link", { name: "Gestionar datos" }).getAttribute("href")).toBe(
    "/settings/data",
  );
  fireEvent.click(screen.getByRole("button", { name: "Ocultar primeros pasos" }));
  expect(screen.queryByRole("link", { name: "Configurar" })).toBeNull();
  unmount();
  const nextChat = render(<GettingStarted hasBusinessData={false} hasMessages={false} />);
  expect(screen.queryByRole("link", { name: "Configurar" })).toBeNull();
  nextChat.unmount();
  render(<GettingStarted hasBusinessData={false} hasMessages />);
  fireEvent.click(screen.getByRole("button", { name: "Mostrar primeros pasos" }));
  expect(screen.getByRole("link", { name: "Configurar" })).toBeTruthy();
});

it("keeps the guide available when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  try {
    render(<GettingStarted hasBusinessData={false} hasMessages={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar primeros pasos" }));
    expect(screen.getByRole("button", { name: "Mostrar primeros pasos" })).toBeTruthy();
  } finally {
    vi.restoreAllMocks();
  }
});
