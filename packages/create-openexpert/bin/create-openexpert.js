#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Scaffold a local OpenExpert project: `npm create openexpert [name]`.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";

const OPENEXPERT_JSON = {
  $schema:
    "https://raw.githubusercontent.com/OpenExpert-ai/OpenExpert/main/packages/opencore/schema/openexpert.schema.json",
  mode: "local",
  modelProvider: "ollama",
  modelId: "llama3.1",
  ollamaBaseUrl: "http://localhost:11434",
  dataDir: "~/.openexpert",
};

const COMPOSE = `# SPDX-License-Identifier: MIT
name: openexpert
services:
  openexpert:
    image: ghcr.io/openexpert/openexpert:local
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      OPENEXPERT_MODE: local
      OPENEXPERT_MODEL_PROVIDER: ollama
      OPENEXPERT_MODEL_ID: llama3.1
      OPENEXPERT_DATA_DIR: /data
      OLLAMA_BASE_URL: http://ollama:11434/v1
    volumes:
      - openexpert-data:/data
    depends_on:
      - ollama
  ollama:
    image: ollama/ollama:latest
    restart: unless-stopped
    volumes:
      - ollama-data:/root/.ollama
    ports:
      - "11434:11434"
volumes:
  openexpert-data:
  ollama-data:
`;

const GITIGNORE = `.openexpert/
credentials.json
.env
.env.*
!.env.example
node_modules/
`;

const README = `# OpenExpert (local)

Generated with \`npm create openexpert\`.

## Run with Docker

\`\`\`sh
docker compose up -d
docker compose exec ollama ollama pull llama3.1
# open http://localhost:3000
\`\`\`

## Run with the CLI

\`\`\`sh
npx @openexpert/opencore serve
\`\`\`

Configuration lives in \`openexpert.json\`.
`;

async function main() {
  let name = process.argv[2];
  if (!name) {
    const answer = await p.text({
      message: "Nombre del directorio",
      initialValue: "openexpert",
    });
    if (p.isCancel(answer)) {
      p.cancel("Cancelado.");
      process.exit(1);
    }
    name = String(answer);
  }

  const dir = resolve(process.cwd(), name);
  if (existsSync(dir)) {
    p.log.error(`El directorio ya existe: ${dir}`);
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "openexpert.json"), JSON.stringify(OPENEXPERT_JSON, null, 2) + "\n");
  writeFileSync(join(dir, "docker-compose.yml"), COMPOSE);
  writeFileSync(join(dir, ".gitignore"), GITIGNORE);
  writeFileSync(join(dir, "README.md"), README);

  p.note(
    `Directorio: ${dir}\n\n` +
      `  cd ${name}\n` +
      `  docker compose up -d\n` +
      `  docker compose exec ollama ollama pull llama3.1\n\n` +
      `O bien:  npx @openexpert/opencore serve\n` +
      `Luego abre http://localhost:3000`,
    "Listo",
  );
  p.outro("OpenExpert listo para usar.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
