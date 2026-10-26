# Support

OpenExpert is an open-source, local-first project. Support is community-based:

- **Bugs and feature requests:** open an issue at
  <https://github.com/OpenExpert-ai/OpenExpert/issues>. Include the version
  (`openexpert version`), your OS and the exact error.
- **Security reports:** do **not** open a public issue. Follow
  [`SECURITY.md`](./SECURITY.md).
- **Configuration check:** run `openexpert doctor`; it prints what is missing
  without sending anything.

There is **no SLA and no guaranteed response time**. If you need a contractual
response time, a deployment review or a private support channel, that is a
separate commercial agreement and is not part of the MIT repository.

## Before asking for help

1. Run `openexpert doctor`.
2. Check that your model supports tool calling (the doctor says so; `llama3.1`
   is the documented default).
3. If the problem is data, say which source it came from (CSV, Pipedrive,
   Holded, Drive, Notion or a local folder) and whether it is a demo row.
4. Never paste API keys, OAuth tokens or a backup file into an issue. The backup
   contains the key that decrypts your credentials.
