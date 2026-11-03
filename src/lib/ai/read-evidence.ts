// SPDX-License-Identifier: MIT
// A read is evidence of what was consulted, not proof of an individual claim.
export type DocumentRead = {
  kind: "drive" | "local" | "notion";
  identifier: string;
  name: string;
  modifiedTime?: string;
  url?: string;
  offset?: number;
  partial: boolean;
};

type ToolPart = { type: string; state: string; output?: unknown };

function driveUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      ["drive.google.com", "docs.google.com"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    )
      return url.href;
  } catch {
    // A malformed or untrusted link is not a source the UI should open.
  }
  return undefined;
}

export function documentReads(parts: ToolPart[]): DocumentRead[] {
  const reads: DocumentRead[] = [];
  for (const part of parts) {
    if (part.state !== "output-available" || !part.output || typeof part.output !== "object")
      continue;
    const out = part.output as Record<string, unknown>;
    if ("error" in out || typeof out["content"] !== "string" || !out["content"].length) continue;
    const kind =
      part.type === "tool-read_drive_file"
        ? "drive"
        : part.type === "tool-read_local_file"
          ? "local"
          : part.type === "tool-read_notion_page"
            ? "notion"
            : null;
    if (!kind) continue;
    const identifier =
      kind === "drive" ? out["id"] : kind === "local" ? out["path"] : out["pageId"];
    if (typeof identifier !== "string" || !identifier) continue;
    const offset =
      typeof out["offset"] === "number" && out["offset"] >= 1 ? out["offset"] : undefined;
    const url = kind === "drive" ? driveUrl(out["webViewLink"]) : undefined;
    reads.push({
      kind,
      identifier,
      name: typeof out["name"] === "string" && out["name"] ? out["name"] : identifier,
      ...(typeof out["modifiedTime"] === "string" && out["modifiedTime"]
        ? { modifiedTime: out["modifiedTime"] }
        : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(url ? { url } : {}),
      partial:
        out["hasMore"] === true ||
        out["truncated"] === true ||
        (offset !== undefined && offset > 1) ||
        (typeof out["charOffset"] === "number" && out["charOffset"] > 0),
    });
  }
  return reads;
}
