# Contributing to OpenExpert

Thanks for your interest in OpenExpert. The project is MIT-licensed and
welcomes contributions of all sizes: bug reports, fixes, documentation,
integrations, and ideas.

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Development setup

Requirements: **Node.js 20+** and **npm 10+** (see `.nvmrc`).

```sh
git clone https://github.com/OpenExpert-ai/OpenExpert.git
cd OpenExpert
npm ci
cp .env.example .env        # optional; Ollama needs no keys
cp openexpert.json.example openexpert.json
npm run dev                 # http://localhost:3000
npm run opencore:doctor     # configuration check
```

## Workflow

1. **Open an issue** before opening a large PR. Small fixes may go straight
   to a pull request.
2. **Fork** and create a branch: `git checkout -b type/short-description`
   (e.g. `fix/oauth-state-leak`, `feat/pipedrive-tool`).
3. **Commit** with a clear message; Conventional Commits are encouraged
   (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
4. **Sign your commits.** The project uses the **Developer Certificate of
   Origin (DCO)** — see below.
5. **Run the checks** locally before pushing:

   ```sh
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```

6. **Open a pull request** against `main`. Fill in the PR template. The CI
   workflow must pass; reviewers may request changes.

## Developer Certificate of Origin (DCO 1.1)

By contributing you certify that you have the right to submit the work
under the project's MIT license. Sign-off is done with `git commit -s`,
which appends:

```
Signed-off-by: Your Name <you@example.com>
```

A signed-off-by trailer is required on every commit.

## Code conventions

- TypeScript strict, no implicit `any`.
- Modules ending in `.server.ts` are server-only.
- Validation at the edge using Zod.
- Error messages visible to the user are written in **Spanish**; logs and
  developer-facing messages in **English**.
- Format with Prettier before committing.

## Documentation

The documentation in `docs/en/` and `docs/es/` is the source of truth for
product and engineering decisions. Update it in the same change as the
code it describes. Follow the [documentation style guide](./docs/STYLE.md)
and, after editing Markdown, run:

```sh
npm run format
npm run check:docs   # links and anchors resolve
```

## Release process

Releases are managed with [Changesets](https://github.com/changesets/changesets).
Add a short note under `.changeset/` describing the change. Maintainers
batch changes into a release, which is published to npm with provenance.

## Security

If you find a security issue, **do not** open a public issue — see
[`SECURITY.md`](./SECURITY.md).

## License

By contributing you accept that your contribution is released under the
project's MIT license.
