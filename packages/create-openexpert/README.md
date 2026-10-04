# create-openexpert

Scaffold a local OpenExpert (OpenCore) project.

```sh
npm create openexpert my-app
cd my-app
docker compose up -d
docker compose exec ollama ollama pull llama3.1
# open http://localhost:3000
```

Generates `openexpert.json`, a `docker-compose.yml` (app + Ollama), a
`.gitignore`, and a short `README.md`.

Licensed under MIT. See the main repository: <https://github.com/OpenExpert/OpenExpert>.
