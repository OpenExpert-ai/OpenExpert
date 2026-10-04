# 01 · Product

> **Audience:** business.

---

## 1. Overview

**OpenExpert** is an operations dashboard with artificial intelligence that runs
**on your own machine**. Its core principle:

> An **Expert** is a digital assistant with its own data context, its own chat
> and its own domain, able to run operational processes — always with explicit
> human approval.

Each Expert is bound to a domain (`general`, `ventas`, `finanzas`, `marketing`),
and the system prevents an Expert from reading another Expert's data.

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
- **Autonomous processes** with a trigger and an approval policy; actions are
  proposed as confirmation cards.
- **Governance:** an activity log of every relevant event and revert for
  revertible changes.
- **Google Drive** (optional): read, create and edit documents from the chat.

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
