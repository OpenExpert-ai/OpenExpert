---
"@openexpert/opencore": patch
---

- `serve` and `desktop` start the local server on `127.0.0.1` instead of every
  interface, and `desktop` refuses a port owned by another application instead of
  pointing the window at it. `OPENEXPERT_HOST` (or `HOST`) exposes it on purpose.
- `doctor` and `models` read the provider from the directory they were given,
  not from the process working directory.
