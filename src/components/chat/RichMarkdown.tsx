// SPDX-License-Identifier: MIT
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const NUM = /^[\s+\-−]?[\d.,]+\s?(€|%|k|M|d|días)?$/;
const isNum = (c: unknown) =>
  typeof c === "string"
    ? NUM.test(c.trim())
    : Array.isArray(c) && c.length === 1 && typeof c[0] === "string" && NUM.test(c[0].trim());

const components: Components = {
  h1: ({ children }) => (
    <h2 className="mt-5 mb-2 font-display text-2xl leading-tight tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-5 mb-2 font-display text-xl leading-tight text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-4 mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="my-2.5 leading-relaxed text-foreground/90">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => (
    <em className="font-display text-[1.05em] not-italic text-primary">{children}</em>
  ),
  ul: ({ children }) => <ul className="my-2.5 space-y-1.5 pl-1">{children}</ul>,
  ol: ({ children }) => (
    <ol className="my-2.5 list-none space-y-1.5 pl-1 [counter-reset:item]">{children}</ol>
  ),
  li: ({ children, node }) => {
    const ordered =
      (node as { parent?: { tagName?: string } } | undefined)?.parent?.tagName === "ol";
    return (
      <li className="relative pl-6 leading-relaxed text-foreground/90 [counter-increment:item] marker:content-none">
        <span
          className="absolute left-0 top-0 font-mono text-[11px] leading-[1.6rem] text-primary/80 before:content-['—'] data-[o=true]:before:content-[counter(item,decimal-leading-zero)]"
          data-o={ordered}
        />
        {children}
      </li>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-md border-l-2 border-warning bg-warning/5 px-4 py-2 text-foreground/85 [&_p]:my-1">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-border" />,
  code: ({ children, className }) =>
    className ? (
      <code className="font-mono text-[11.5px] leading-relaxed">{children}</code>
    ) : (
      <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-primary">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md border border-border bg-sidebar p-3 text-muted-foreground">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-0 even:bg-muted/20">{children}</tr>
  ),
  th: ({ children }) => (
    <th
      className={`px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground ${isNum(children) ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      className={`px-3 py-2 text-foreground/90 ${isNum(children) ? "text-right font-mono tabular-nums" : ""}`}
    >
      {children}
    </td>
  ),
};

export function RichMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className="text-sm [&>*:first-child]:mt-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
      {streaming && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse bg-primary"
        />
      )}
    </div>
  );
}
