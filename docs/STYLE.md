# Documentation style guide

> **Audience:** anyone writing or editing documentation.

This guide keeps the docs consistent and verifiable. The English docs under
`docs/en/` are the **source of truth**; `docs/es/` mirrors them.

## Language

- **English is primary.** When behaviour changes, update `docs/en/` first, then
  mirror the change to `docs/es/`.
- Write in clear, plain language. Prefer short sentences.
- Keep the two versions structurally identical: same numbered sections, same
  tables, same examples.

## File naming

- Numbered docs: `NN-slug.md` (`00-quickstart.md`, `13-ai-providers.md`).
- The Spanish mirror keeps the same number and a Spanish slug
  (`00-inicio-rapido.md`).
- Non-numbered: `README.md`, `roadmap.md`, `STYLE.md`.

## Structure

- Start with a `# NN · Title` heading.
- Add an audience note right after the title:

  ```md
  > **Audience:** engineering.
  ```

- Number the main sections: `## 1.`, `## 2.`, … and subsections `### 2.1.`.
  **Exception:** glossaries and changelogs are not numbered.
- End with a `## References` (EN) / `## Referencias` (ES) section linking the
  related documents.
- Declare technical identifiers (table names, columns, env vars, paths, tool
  names) in `monospaced code`.

## Links

- Use **relative** links (`./03-data-model.md`, `../README.md`), never absolute
  URLs for in-repo files.
- If you link to a heading, use its exact anchor. Anchors are validated by
  `npm run check:docs`.

## Tables and code

- Use tables for enumerations (variables, fields, options).
- Fence code blocks with a language (`sh`, `json`, `sql`, `md`).
- Keep line-oriented examples copy-pasteable.

## Quality checklist

Before opening a PR that touches docs:

1. `npm run format` — Prettier formats Markdown.
2. `npm run check:docs` — links and anchors resolve.
3. Both languages updated and structurally in sync.
4. Any code claim matches the code (if they disagree, the code is right).

## References

- [Documentation index](./README.md).
- [Contributing](../CONTRIBUTING.md).
