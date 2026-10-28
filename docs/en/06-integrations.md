# 06 · Integrations

> **Audience:** both.

---

## 1. Status

Only **Google Drive**, **local folders** and **Notion** are available, and all are
optional. The other connectors are modelled in the data but pending credentials.

| Integration      | Category      | Connection     | Status                   |
| ---------------- | ------------- | -------------- | ------------------------ |
| **Google Drive** | Productivity  | OAuth + Picker | **Available**            |
| **Local files**  | Productivity  | Local server   | **Available**            |
| **Notion**       | Productivity  | OAuth 2.0      | **Available**            |
| **Pipedrive**    | CRM           | API token      | **Available (optional)** |
| **Holded**       | ERP / Finance | API key        | **Available (optional)** |
| **CSV import**   | Business data | File           | **Available**            |
| Salesforce       | CRM           | By licence     | Pending                  |
| Gmail            | Productivity  | API            | Pending                  |
| Slack            | Productivity  | API            | Pending                  |
| Google Analytics | Advertising   | API            | Pending                  |
| Meta Ads         | Advertising   | Token          | Pending                  |

## 2. Google Drive

Connect your own Google account from **Integraciones → Fuentes**; you do not need
to touch Google Cloud.

### 2.1 Flow

1. **Integraciones → Fuentes** → `Conectar mi cuenta`.
2. A disclosure dialog explains the scope, where it flows and what the model
   provider sees. Click `Entiendo y conecto` to continue.
3. Google asks for `drive.file` and redirects to
   `http://localhost:3000/auth/google/callback` with a code + PKCE verifier.
4. The callback verifies the HMAC-signed `state`, exchanges the code with the
   verifier and stores the encrypted tokens in `~/.openexpert/credentials.json`.
5. **Integraciones → Fuentes** → `Seleccionar archivos` opens the Google Picker
   so you grant OpenExpert access to specific files.
6. The granted list lives encrypted in `~/.openexpert/drive-grants.json`. The
   chat can search/read/create/edit only within that list.
7. The trash icon **revokes** access to that file: its id is dropped from
   `drive-grants.json`, `search_drive` stops listing it, `read_drive_file`
   answers `(sin acceso)` and the change is recorded in the activity log.
   `Desconectar` revokes every file at once.

If the Google Picker script cannot be loaded —the connection dropped, a script blocker
stopped it, the CSP does not allow it— the attempt can be **retried**. The failed attempt is
not remembered: the next click asks for the script again, and the message that explains the
failure says what to check. Reloading the page is not needed.

The same holds when `api.js` loads but the library never starts: if the `picker` module does not
call back within **20 s**, the attempt fails with the reason
(`El cargador de Google (gapi) no respondió en 20 s…`) instead of leaving the button spinning
with nothing to read. That failure is not remembered either: the next click asks for the library
again.

Reads are bounded: **25 MB per file**. The size comes with the metadata, so a bigger file is
refused with a clear note before it is downloaded; for plain text and for exports (Docs to text,
Sheets to CSV) the cap is applied while reading, so a huge document never reaches process memory
whole. A `.pptx` or an OpenDocument also has a **64 MB decompressed** cap: a 256 KiB ZIP can ask for
256 MB of memory when inflated, so a document declaring more is refused with a note instead of being
unzipped.

The file size and the answer size are two different things: a document that fits the cap arrives in
**windows of lines** (2000 lines and 20.000 characters per read). When the answer carries
`hasMore`, the rest is asked for with `offset: nextOffset`; when it also carries `nextCharOffset`,
that goes in `charOffset` with the same `offset`, which is how a line that did not fit is
continued. `totalChars` says how long the document is, so what is left is known instead of guessed.

Chained windows are the document: a continuation opens with the newline that separates its first
row from the last one of the previous read, so the text of two consecutive reads never glues two
rows together. `truncated` marks one thing only: the cut split a line in half, which is what asks
for `nextCharOffset` to go on inside it. A clean cut between lines leaves it unset even when text
is left, because the rest is asked for with `hasMore` anyway.

### 2.2 Scopes

| Scope        | Purpose                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| `drive.file` | Per-file access (non-sensitive). No CASA required. The user selects files with the Picker. |

### 2.3 Privacy

The in-product disclosure is shown before connecting. The policy lives in
[`PRIVACY.md`](../../PRIVACY.md) (English) and
[`docs/es/POLITICA-DE-PRIVACIDAD.md`](../es/POLITICA-DE-PRIVACIDAD.md) (Spanish).

## 3. Notion

Notion connects with OAuth 2.0. In **Integraciones → Fuentes → Notion**, click
`Conectar Notion` and choose in Notion's own picker which pages/databases
OpenExpert may access; there are no API keys to configure.

1. **Integraciones → Fuentes → Notion** → `Conectar Notion`.
2. Notion shows the connection capabilities and its page picker; the user chooses
   which pages/databases OpenExpert may access.
3. Notion redirects to `http://localhost:3000/auth/notion/callback` with a code.
4. The callback verifies the HMAC-signed `state`, exchanges the code
   (`POST /v1/oauth/token`, HTTP Basic) and stores the **long-lived** token
   encrypted in `~/.openexpert/notion.json` (`0600`). Notion has no refresh token.

Each user authorizes the connection **in their own workspace** (`owner=user`) and
gets their own token, stored locally. There is no shared data token, so no one
else sees your token or content. The API version is pinned with the
`Notion-Version` header (`2026-03-11`); the rate limit is ~3 requests/second and
`Retry-After` is respected.

Reads arrive paginated: a search or a data source query returns at most 100
results per request plus a `has_more`. OpenExpert follows up to five pages (500
results) per call and returns `count`, `hasMore` and `nextCursor`; when there is
more list, the assistant continues with that cursor instead of taking the list as
complete. A long page is read up to 300 blocks by default and the answer carries
`blocks` and `hasMore`, so a 400-block document is never handed over half-read
without saying so: the assistant raises `maxBlocks` (up to 1000) and continues. The
same `hasMore` covers the other cut: nested blocks are followed four levels deep
(page, children, grandchildren and great-grandchildren), and when a fourth-level
block has children of its own, that text is not read and the answer says so. There
raising `maxBlocks` changes nothing, because the cap at play is depth, not block
count.

## 4. Local folders

The assistant can read and write files in **folders on the same machine**,
without Google. Pick them in **Integraciones → Fuentes → Archivos locales**,
either with the built-in folder navigator or by typing an absolute path. The
grants live encrypted in `~/.openexpert/local-roots.json`.

- Access is **only inside the granted folders**. Every path is resolved with
  `realpath` and checked against the roots, so symlink escapes are rejected.
  Creating a file refuses a name that already exists, symlinks included — a
  dangling one counts — so the write never follows an entry out of the folder.
- Reads return text, PDF text and Office content (Word `.docx`, Excel `.xlsx`,
  PowerPoint `.pptx`, OpenDocument). A CSV or a TSV also comes back as a
  **table** (columns and data rows, not lines), and the separator is read from
  the text itself —`,`, `;` (what Excel writes in Spanish), tab or `|`— never
  from the extension: a single-column file still has one column. Writes
  (`create_local_file`, `update_local_file`) require **human approval**, like
  Drive writes.
- Bounded: 25 MB per file, 200k characters returned, 5,000 files and depth 8 per
  listing; `.git`, `node_modules`, dotfiles and secret files are skipped. The listing
  caps bound the walk, not the folder: when one of them cuts it short the answer says
  so (`truncated`) instead of passing the cap off as the number of files there.
- The settings panel's folder navigator shows at most 2,000 entries per folder,
  subfolders first, and says so when there are more: “Showing 2,000 of 2,120
  entries”. The cut is taken **after** sorting, so the subfolders —the only thing
  you can click to keep navigating— are never left out by the order in which the
  system returns the directory.
- Docker: the server sees the container filesystem, so mount the folder with
  `-v /host/folder:/data/folder`.

## 5. Business connectors

Pipedrive, Holded and CSV are optional and **pull-only**: OpenExpert reads from
them and never writes back. Their keys are stored in `~/.openexpert/secrets.json`
(`0600`) and are never shown again after they are saved.

A sync brings at most **5,000 rows** (50 pages of 100). When the provider has
more, the panel toast says so — "Synced N records; the download hit the cap and
more rows were left behind" — instead of letting the slice pass for the total;
the rest is not downloaded and the integration stays connected.

### Pipedrive

**Settings → Data → Business connectors.** Create a personal API token in
Pipedrive (Settings → Personal preferences → API) and paste it. The sync reads
deals and maps company, stage, value, owner, days in stage, expected close date
and status. Rows are upserted by `pd-<id>`; syncing again updates them.

### Holded

**Settings → Data → Business connectors.** Create an API key in Holded
(Settings → Developers) and paste it. The sync reads invoices and maps client,
amount, due date and status (`pending`/`partial` → open, `completed` → paid,
`cancelled`/`failed` → cancelled). Rows are upserted by `holded-<id>`. Amounts
follow the same rule as the CSV import, so `1.234,56` reads as 1,234.56 euros;
an unreadable amount and a due date that does not exist (`2026-02-31`) **skip
the invoice** instead of storing it as zero euros.

### CSV import

**Settings → Data → Import CSV** covers deals, invoices, campaigns and accounts.
Download the template, fill it and import; Spanish and English header names are
accepted. The row key is `id`, or `csv-<entity>-<row>` when the file has no id
column. A file is capped at 5,000 rows and one bad row is reported by line
number without discarding the rest; the rows **above the cap are not imported
and are counted separately**, so the notice says how many were left out instead
of passing them off as failed rows. The notice counts **every** rejected row
(`skipped`) and details the first twenty, which is what the server sends; when
more were dropped it says so, so the sample is not mistaken for the total. A file
where nothing gets in is not announced as an import: only the error notice shows.
In the money columns —deal value, invoice
amount, spend, CPA target, daily budget and MRR— an **empty** cell is 0, but a
cell that is not a number (`n/d`, `1.234,56 (IVA)`) **rejects the row**: it used
to be imported as 0 and the invoice showed zero without the import saying so.

A dot with three decimals is a thousands separator (`1.234` is one thousand two
hundred thirty-four) **unless the integer part is zero**: `0.500` is €0.50, not
€500. It used to multiply the amount by a thousand for an English-format file
with three decimals, while the same value with a comma (`0,500`) read correctly.

The import counts **rows written**, not appearances of an id. A file can carry
the same id twice — two exports concatenated, an invoice repeated —: the first
appearance inserts and the second updates the row the first one just wrote, so
that is one insertion and one update, never two insertions. The panel used to
say "2 imported" over a table with a single row, and the total did not match
what was stored.

## 6. AI tools

| Tool                                                                                           | Behaviour                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_drive`                                                                                 | Searches the granted files only and reports how many match (`total`), even when it returns just the first 100 (`hasMore`)                     |
| `read_drive_file`                                                                              | Reads only within the grants; returns it in windows of lines (`hasMore`/`nextOffset`, plus `nextCharOffset` when the cut falls inside a line) |
| `create_drive_file`                                                                            | Creates a new file the app owns                                                                                                               |
| `update_drive_file`                                                                            | Edits a granted file or a file the app created                                                                                                |
| `list_local_files` / `search_local_files`                                                      | Lists/searches the granted local folders; reports how many there really are (`total`) and when the walk was cut (`truncated`)                 |
| `search_inside_files`                                                                          | Finds text **inside** file contents, ignoring case and accents; when the file cap stops it, says how many files it left unread                |
| `read_local_file`                                                                              | Reads a granted local file; returns it in line windows (a long line continues by character) and describes the table                           |
| `create_local_file` / `update_local_file`                                                      | Writes a local file, with human approval                                                                                                      |
| `run_python`                                                                                   | Runs a short Python script for **calculations**, in a temporary directory                                                                     |
| `search_notion` / `describe_notion_data_source` / `query_notion_database` / `read_notion_page` | Reads the shared Notion content                                                                                                               |
| `create_notion_page` / `update_notion_page` / `append_notion_blocks`                           | Writes to Notion, with human approval                                                                                                         |

Drive reads require `gdrive` in the Expert's `sources`; local reads require
`local`; Notion reads require `notion`; and running code, `python`. All writes go through human
approval.

`run_python` is not a connector but a capability: it stays off until it is enabled per Expert. The
script runs in its own temporary directory, with no network access —it runs inside an isolated
network namespace and is not executed at all when the system cannot create one— and none of the
application's environment, under a time limit and with capped output. It cannot see the rest of the
disk either: only its temporary directory and a read-only `/usr`, because both guarantees come from
`bubblewrap`. On a machine without it —or with user namespaces disabled— the script is not run and
the result says how to install it (`apt install bubblewrap`, `dnf install bubblewrap` or
`pacman -S bubblewrap`). It can only rely on Python's standard library, and the script that ran is
kept in the activity trail.

A **scanned PDF** has no text layer: it is a photograph of a page. When the setting "Read
scanned PDFs with the model" is on —it ships **off**—, the document is transcribed by the
active model, which has to be able to see documents. That happens **only on an explicit read
of a file**, never while a search walks a folder, and the transcription is literal rather
than a summary, because it feeds the search and the windowed read. The transcription has a
ceiling of 200,000 characters: when a document goes past it, the read carries `truncated`
and a note saying how much was transcribed, because the end cannot be asked for again —it
was never transcribed— and, without that warning, the first half would pass for the whole
document.

### 5.1 Model providers

Providers are **data**: `packages/openexpert/src/providers.ts` is a catalogue, and every record
carries its adapter (`google`, `openai-compatible`, `anthropic`), its endpoint, the
**environment variable** holding its key, its headers and — when the service asks for it —
the **header that must carry the conversation id**. The provider identifier is **derived from
the catalogue**, so adding one is adding a record, not editing three files.

**No two records may share that variable.** It is what makes each provider's key independent:
with a shared one, saving a key silently overwrites another provider's, and the failure stays
hidden until that provider stops authenticating. A test enforces the uniqueness. The panel,
the CLI and `doctor` read the key's variable, the endpoint and the models off the record, so
none of them keeps a provider list of its own.

Models are records too —name, cost, context, tool calling, reasoning— and a model with no
figures recorded is one whose figures **have not been checked**, not one that is free. The
settings screen builds its option list by walking the catalogue: none is written by hand.

**Two providers are left out on purpose.** _Copilot_, because its terms provide the service
through its own extensions and using it elsewhere is very likely a breach. And the _Nous
portal_, whose access is an OAuth account rather than an API key. The reason lives next to
the catalogue so nobody retries it unaware.

## 7. Security notes

- Tokens and grants are **AES-256-GCM encrypted** with a key file generated
  on the local machine (`~/.openexpert/secret.key`, mode `0600`).
- OAuth `state` includes a PKCE verifier signed with an HMAC of the
  nonce + verifier; the secret lives in `~/.openexpert/state-secret` (or
  `GOOGLE_OAUTH_STATE_SECRET`).
- Notion's long-lived token lives in `~/.openexpert/notion.json` (`0600`,
  AES-256-GCM); its `state` is HMAC-signed with `~/.openexpert/state-secret-notion`.
- Local folder access is restricted to the granted roots (see
  [`04-security.md`](./04-security.md)).
- The browser is trusted in the local single-owner edition (see
  [`04-security.md`](./04-security.md)).

## 8. References

- [Architecture](./02-architecture.md) — layers.
- [AI](./05-ai.md) — tool catalogue.
- [Security & access](./04-security.md) — secrets.
- [PRIVACY.md](../../PRIVACY.md) — privacy policy.
