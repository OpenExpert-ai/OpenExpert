# 12 · Licensing model

> **Audience:** both. What is open, what is monetised, and what
> obligations contributors and users take on.

---

## 1. License

The entire OpenExpert repository is distributed under the **MIT
License**. The full text is in [`LICENSE`](../../LICENSE) at the root of
the repository.

This includes:

- The cloud application code (`src/`, `drizzle/migrations/`,
  `supabase/`, the application configuration).
- The OpenCore MIT package (`packages/opencore/`).
- The Docker image build configuration (`docker/`).
- The documentation (`docs/`, `README.md`).

## 2. What is monetised

The MIT license grants everyone the freedom to use, copy, modify and
distribute the software. OpenExpert does not monetise the code; it
monetises **services** that run on top of it:

1. **Hosted cloud edition.** A managed deployment with multi-user
   roles, invitations, centralised audit and managed backups. Users
   pay for hosting and operational guarantees, not for the code.
2. **OpenExpert model gateway.** A managed AI gateway (the
   `openexpert` provider). Users get a curated experience, quota and
   support; the client itself is MIT and can also point at any
   OpenAI-compatible endpoint.

This pattern — open-source client plus monetised service — is shared
with projects such as OpenCode + Go/Zen.

## 3. Obligations

MIT is permissive. The only requirement is to preserve the copyright
notice and the permission notice in copies of the software. There is
no copyleft: you may modify the code and ship a closed derivative.

Practical obligations:

- Keep the `LICENSE` file and copyright notices in any distribution.
- Third-party components (React, Tailwind, Radix, AI SDK, …) keep their
  own licenses. See [`NOTICE`](../../NOTICE).
- Do **not** use the OpenExpert trademark to mislead about its
  endorsement by the project.

## 4. Contributing

By submitting a contribution you accept the Developer Certificate of
Origin 1.1 (see [`CONTRIBUTING.md`](../../CONTRIBUTING.md)) and your
contribution is released under the MIT license.

## 5. Security reports

Vulnerabilities must be reported privately. See
[`SECURITY.md`](../../SECURITY.md).

## 6. Trademarks

"OpenExpert" and "OpenCore" are project names. The MIT license does not
grant rights to use them as product names or to imply endorsement.
Contact the maintainers if you want to use them.
