# 01 · Product

> **Audience:** business.

---

## 1. Overview

**OpenExpert** is an operations dashboard with artificial intelligence that runs
**on your own machine**. Its core principle:

> An **Expert** is a digital assistant with its own data context, its own chat
> and its own domain, able to read and act on its domain's data — always with
> explicit human approval.

Each Expert is bound to one or more domains (`ventas`, `finanzas`, `marketing`,
`clientes`), and the system prevents it from reading data outside them.

## 2. Problem it solves

Company information is scattered across CRM, ERP, advertising platforms and
documents. Answering cross-cutting questions by hand takes exports and
consolidation. OpenExpert automates the reading and the analysis, but **not the
execution**: AI proposes, a person approves.

## 3. Features

- **Experts** with per-domain isolation. The initial set is `general`, `ventas`,
  `finanzas`, `marketing`.
- **Chat with real data** through tools that query the local database. It does
  not invent numbers.
- **Governance:** an activity log of every relevant event and revert for
  revertible changes.
- **Google Drive** (optional): read, create and edit documents from the chat.
- **Configuration panel** (`/settings`): model & AI, chat & agents, data and
  backups, appearance and advanced options (diagnostics and editing
  `openexpert.json`). Changes take effect without restarting.
- **Bilingual interface** (Spanish/English) selectable from Appearance.

## 4. Usage

Open <http://localhost:3000>, pick an Expert and ask in natural language, e.g.
"What is the state of the pipeline and which opportunities have not moved in
three weeks?". You get a structured answer with the conclusion, a table and
recommendations.

## 5. Scope

| Capability                                                              | Status   |
| ----------------------------------------------------------------------- | -------- |
| Local, single-owner edition                                             | Active   |
| Chat with tools and streaming                                           | Active   |
| Google Drive read/write                                                 | Optional |
| Audit log and revert                                                    | Active   |
| Pipedrive, Holded, Salesforce, Meta Ads, Gmail, Slack, Google Analytics | Pending  |
| Automatic trigger scheduler                                             | Pending  |

## 6. Edition

There is a single edition: **local**. See [Quickstart](./00-quickstart.md) and
[Licensing model](./12-licensing.md).
