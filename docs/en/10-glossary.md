# Glossary

> **Audience:** business and any reader of the UI or technical
> documentation.
>
> Terms are presented in the language they appear in the application.

---

## Product concepts

**Expert**
: Working context with its own UI, data and permissions. It is the unit
of isolation: an Expert cannot access another Expert's data. It
corresponds to a functional area with its own assistant. Initial
Experts: `general`, `ventas`, `finanzas`, `marketing`.

**Sources** (Fuentes)
: Connectors assigned to an Expert. They are declared per Expert: if a
source is not declared on an Expert, its chat does not enable the
corresponding tools, even if the person has the connector connected.

**Process** (Proceso)
: Automatable sequence of steps with a trigger ("Cron · Friday 17:00",
"Event · invoice due +7 days") and an approval policy. Examples:
overdue invoice follow-up, campaign efficiency, pipeline health.

**Run** (Ejecución)
: Start of a process. If the process requires approval, the run
generates a confirmation card and produces no effects until approved.

**Proposal** (Propuesta)
: Action suggested by the assistant and pending execution. It is
presented as a card with the exact detail of the planned changes. It
is the central control mechanism: AI proposes, the person decides.

## People and permissions

**ADMIN (administrator)**
: Full control. Can create Experts, invite members, change roles and
permissions, revert changes, configure integrations and approve
actions on any Expert.

**INTERMEDIO**
: Can consult and execute in the Experts where they have permission.
Cannot manage members or permissions.

**LECTOR**
: Can only consult and read. **Cannot** execute actions or write,
regardless of assigned permission. Default role in the absence of an
explicit role.

**Per-Expert permission**
: A person's access level on a specific Expert: `none` (no access),
`read` (consult and read) or `exec` (additionally, execute).
Independent of role.

**Invitation**
: Pre-authorisation to access. An unauthorised person cannot sign in
even with a valid Google account. Each invitation is **single-use**.

**Owner** (Propietario)
: First registered account; the only one exempt from the invitation
requirement. Its protection is implemented in the sign-up trigger.

## Data and metrics

**Deal / opportunity**
: CRM record. Main fields: company, stage, value, owner, **days in
stage** —used to detect stuck opportunities— and status.

**Win rate**
: Percentage of won opportunities out of total closed opportunities.

**Forecast**
: Sum of the value of open opportunities, weighted by each stage's
probability: qualification 10%, demo 25%, proposal 45%, negotiation
70%, and 20% for unclassified stages.

**Overdue invoice**
: Invoice whose due date has passed. The assistant computes days
overdue and number of reminders sent.

**CPA**
: Cost per acquisition. Computed as spend divided by conversions in the
last seven days, and compared with the campaign target to detect
over-cost.

**MRR**
: Monthly recurring revenue of a customer account.

**Churn**
: Customer cancellation. Estimated by combining usage drop, open
tickets and risk score.

## AI and tools

**Tool** (Herramienta)
: Function the assistant can invoke to obtain data or propose an
action. The assistant has no direct access to the database; it
operates through them.

**Reasoning** (Razonamiento)
: Exposed analysis of the model before the answer, when it uses
tools. It is auditable: it indicates why each invocation.

**Streaming**
: Progressive transmission of the response while it is being
generated, visible as incremental text in the UI.

**System prompt**
: Set of instructions that defines the assistant's behaviour:
language, output format and safety rules. Versioned in code.

**Prompt injection / evasion attempt**
: Attempt to bypass the assistant rules, e.g. by impersonating an
administrative role. The system detects it with a pre-filter,
blocks the request before the model processes it, and logs the
attempt.

**Out of context** (Fuera de contexto)
: System response to a request for data belonging to another Expert.
It corresponds to correct isolation behaviour, not an error.

## Infrastructure

**Supabase**
: Platform providing the database, authentication and API. Data lives
in PostgreSQL with row-level security.

**Service role key**
: Database administration credential with total access. Its use is
restricted to server modules.

**Publishable key**
: Public credential for the browser. Only allows the operations
authorised by security rules; in this project, reads.

**RLS (Row Level Security)**
: Row-level security. Rules applied by the database to determine
which rows each user can see or modify. In this project, members
have read access and every write is performed by the server.

**Trigger**
: Action automatically executed on row insertion or modification. Used
for new-user access validation and value normalisation.

**Migration**
: Versioned SQL file that modifies the schema. Migrations are applied
in order and are immutable once applied; any fix requires a new
migration.

**Server function**
: Function executed on the server and invoked remotely by the browser.
Every application write uses this mechanism, which is the single
permission check point.

**Vercel**
: Deployment and execution platform for the application.

**Nitro**
: Layer that adapts the server for execution on the deployment
platform.

**Refresh token**
: Long-lived credential that allows obtaining new access tokens
without requiring a new authorisation.

**Scope**
: Permission requested from the user during authorisation. Sign-in
requests `email profile`; Drive requests `drive.readonly` (read) and
`drive.file` (create and edit).

**Allow list**
: List of allowed return addresses after sign-in. If the application
address is not in the list, access is blocked after authentication.

## References

- [Product](./01-product.md) — functional description.
- [Security & access](./04-security.md) — detailed roles and
  permissions.
