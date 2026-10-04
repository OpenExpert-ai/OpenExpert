# Glossary

> **Audience:** business and any reader of the UI.

---

**Expert**
: Working context with its own UI, data and domain. The unit of isolation: an
Expert cannot read another Expert's data. Initial Experts: `general`, `ventas`,
`finanzas`, `marketing`.

**Sources**
: Connectors assigned to an Expert. Declared per Expert: if a source is not
declared, its chat does not enable the corresponding tools.

**Process**
: Automatable sequence with a trigger and an approval policy. Example: overdue
invoice follow-up.

**Proposal**
: Action suggested by the assistant and pending execution, shown as a card. AI
proposes, the person decides.

**Tool**
: Function the assistant can call to obtain data or propose an action. The
assistant has no direct database access.

**Reasoning**
: The model's analysis exposed before the answer when it uses tools.

**Prompt injection**
: Attempt to bypass the assistant rules. The system blocks it with a pre-filter
and logs it.

**Out of context**
: Response when a request belongs to another Expert. It is correct isolation,
not an error.

**Revert**
: Restoring a previous state from the snapshot stored in the activity log.

**SQLite**
: The local database engine. All data lives in a single file,
`OPENEXPERT_DATA_DIR/openexpert.db`.

**Ollama**
: Local model runtime. No keys, no data leaves the machine.

**BYOK**
: "Bring your own key": use your own API key for a remote provider.

**Scope**
: Permission requested from Google during authorisation. Drive requests
`drive.readonly` and `drive.file`.

## References

- [Product](./01-product.md).
- [AI](./05-ai.md).
