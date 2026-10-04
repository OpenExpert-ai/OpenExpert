# 04 · Security & access

> **Audience:** both. Business: who can see and do what. Engineering:
> how the rules are enforced.

---

## 1. Who can sign in

Access is granted exclusively through **Google sign-in (OAuth 2.0)**.
No local passwords, no open registration.

Authorisation is applied in three successive layers:

1. **Identity provider.** Only Google is enabled. The email/password
   provider is disabled.
2. **Sign-up authorisation** (`handle_new_user` trigger). Verifies the
   provider is `google` and that the email belongs to the initial
   administrator or appears in the `invitations` table. Invitations are
   **single-use**: they are removed on consumption.
3. **Application profile.** Access requires a row in `profiles`, created
   exclusively by the trigger above. An authenticated identity without
   a profile is denied access.

> Implementation note: the `ALLOWED_EMAIL` constant in code is
> documentation only. The effective access list lives inside the
> trigger in PostgreSQL.

The first registered user becomes `ADMIN`. Subsequent users take the
role indicated by their invitation.

## 2. Role model

| Role         | Read Experts  | Execute actions  | Manage members |
| ------------ | ------------- | ---------------- | -------------- |
| `ADMIN`      | All           | Yes, on all      | Yes            |
| `INTERMEDIO` | Only assigned | Yes, on assigned | No             |
| `LECTOR`     | Only assigned | Never            | No             |

The role is a **maximum limit**, not a direct permission. Effective
permissions are defined per Expert.

## 3. Per-Expert permissions

For each user–Expert pair, exactly one of:

| Level  | Meaning                                                    |
| ------ | ---------------------------------------------------------- |
| `none` | The Expert is invisible.                                   |
| `read` | Allows consulting the Expert and receiving read answers.   |
| `exec` | Includes the above and authorises proposing write actions. |

Effective rules:

- Read (`canRead`): user is `ADMIN`, or their level on the Expert is
  not `none`.
- Execute (`canExec`): user is not `LECTOR`, and either is `ADMIN` or
  has level `exec` on the Expert.

Invariants:

- A `LECTOR` cannot hold level `exec`. Switching the role to `LECTOR`
  downgrades existing `exec` levels to `read`.
- Every `ADMIN` has `exec` on every Expert.

### 3.1. Decision matrix

| Situation                              | Result                           |
| -------------------------------------- | -------------------------------- |
| `ADMIN` requests any operation         | Authorised                       |
| `INTERMEDIO` with `exec` on the Expert | Authorised                       |
| `INTERMEDIO` with `read` on the Expert | Read allowed; write denied       |
| `INTERMEDIO` without permission        | Denied, with explanatory message |
| `LECTOR` with any permission           | Read if permitted; execute never |
| No row in `expert_access`              | Denied                           |

## 4. Isolation between Experts

No Expert can query another Expert's data. From a domain Expert (e.g.
`ventas`) only that domain's data is queried; from `general`, every
domain for which the user has read permission.

Any out-of-context invocation returns an explicit error, no data.
Google Drive has an additional rule: access is decided by the Expert's
`sources` column. An Expert without `gdrive` in `sources` does not
enable Drive tools.

## 5. Guarantees against assistant misuse

Three independent mechanisms, none depending on the model's behaviour:

### 5.1. Pre-filter before the model exists

Certain patterns (privilege escalation, instruction override, prompt
extraction, unrestricted modes) are checked before any content is sent
to the model. On match, the request is interrupted and the attempt is
logged in `activity` with status `denied`.

### 5.2. Server-side permission check

Every tool checks `canRead` / `canExec` on the server before any
access. Even an improper model response cannot write without the
correct permission.

### 5.3. Human approval of actions with effect

The assistant does not execute business actions: it only proposes them.
The proposal tools create a row in `activity` with status `pending`,
without modifying data. The change happens only after explicit approval
in the UI.

Exception: writes to Google Drive (create and edit documents), whose
approval is implicit in the chat request as they have no effects
outside Drive. Every write is logged in `activity`. See
[06-integrations](./06-integrations.md#4-exception-for-drive-writes).

## 6. Secret management

| Secret                      | Scope              | Notes                                       |
| --------------------------- | ------------------ | ------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only        | Bypasses RLS. Only in `.server.ts` modules. |
| `SUPABASE_PUBLISHABLE_KEY`  | Browser and server | Subject to RLS.                             |
| `GOOGLE_CLIENT_SECRET`      | Server only        | Only in the Drive tokens module.            |
| `GOOGLE_API_KEY`            | Server only        | Only in the assistant layer.                |
| `GOOGLE_OAUTH_STATE_SECRET` | Server only        | HMAC signer of the OAuth `state` parameter. |

Rules:

- Service keys are read exclusively via env vars in `.server.ts` files.
- `.env` is git-ignored; `.env.example` documents each variable by
  name, without values.
- The OAuth `state` parameter carries the user id signed with
  HMAC-SHA256.

In OpenCore local mode, Drive secrets live in `credentials.json`
(mode `0600`) inside the local data directory.

## 7. Known limits of the model

| Risk                            | Status                                                                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| Member with `read` on an Expert | By design: isolation is per Expert, not per row.                           |
| RLS                             | Grants read to authenticated members; per-Expert control lives in the app. |
| `ADMIN` scope                   | Total visibility, consistent with the role model.                          |
| System prompt                   | Visible in source. Not confidential.                                       |
| Encryption                      | Provided by the database platform.                                         |

## 8. Activity log and revert

### 8.1. Activity log

Each event records actor, type, Expert, result, summary, sources and
duration.

| Type                      | Circumstance                                |
| ------------------------- | ------------------------------------------- |
| `Query`                   | Chat question with answer and sources       |
| `Configuration`           | New Expert, process activation              |
| `Role change`             | Role modification, with before/after values |
| `Permissions`             | Per-Expert permission modification          |
| `Invitation`              | New invitation                              |
| `Integration`             | Connect, disconnect or sync                 |
| `Security`                | Blocked evasion attempt or denied access    |
| `Revert`                  | Annulment of a prior change                 |
| `Process run`             | Request to run a process                    |
| `Drive · create` / `edit` | Files created or modified from chat         |

### 8.2. Revert

Every revertible operation stores the prior rows in `snapshot.entries`
keyed by primary key. Revertible: `experts`, `expert_access`,
`user_roles`, `integrations`, `processes`, `invoices`, `campaigns`,
`invitations`.

Limitations: only `ADMIN`; only `ok` events with snapshot; revert is
not transactional; the revert event itself is not revertible.

## 9. OpenCore local mode notes

In local mode (`OPENEXPERT_MODE=local`) there is a single owner
(`local-owner`, `ADMIN`), no authentication and no invitations.
Isolation per Expert, pre-filter and human approval are preserved.
Persistence lives in local files. See [11-opencore](./11-opencore.md).

## References

- [Data model](./03-data-model.md) — database-level security.
- [AI](./05-ai.md) — tools and checks.
- [Integrations](./06-integrations.md) — Drive token security.
