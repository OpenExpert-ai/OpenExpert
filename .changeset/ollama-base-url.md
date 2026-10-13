---
"@openexpert/opencore": patch
---

Normalise the Ollama base URL without the `/\/+$/` regex, which CodeQL reports as
a polynomial ReDoS on a long run of slashes. Trailing slashes are now stripped
with a loop; the `http://host`, `http://host/` and `http://host/v1` shapes keep
behaving exactly as before.
