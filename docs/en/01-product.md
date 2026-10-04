# 01 · Product

> **Audience:** management and business team.
> **Also relevant:** engineering to scope what is implemented and pending.

---

## 1. Overview

**OpenExpert** is an operations dashboard with artificial intelligence for
businesses. Its core principle:

> An **Expert** is a digital assistant with its own data context, its own
> chat, and its own permissions. It can run operational processes — always
> with explicit human approval.

This is not a generic chatbot. Each Expert is bound to a specific domain
(management, sales, finance, marketing), and the system prevents an
Expert from accessing another Expert's data.

## 2. Problem it solves

In a mid-sized business, information is scattered across CRM, ERP,
advertising platforms and corporate documents. Management must
repeatedly answer cross-cutting questions, for example:

- What is the pipeline value and which opportunities are stuck?
- Which invoices are overdue and for how much?
- Which campaigns are over their cost target?
- Which customer accounts are at risk of churning?

Compiling those answers by hand requires exports and consolidation.
OpenExpert automates the reading and the analysis, but **not the
execution**: AI proposes, a human approves.

## 3. Features

### 3.1. Experts

An Expert is the working context. The initial setup includes four
Experts:

| Expert      | Scope                               | Declared sources                         |
| ----------- | ----------------------------------- | ---------------------------------------- |
| `general`   | Management: KPIs, OKRs              | Pipedrive, Holded, Meta, Slack, Drive    |
| `ventas`    | CRM, pipeline, leads, forecast      | Pipedrive, Salesforce, Gmail             |
| `finanzas`  | Invoicing, reconciliation, treasury | Holded, Gmail, Google Drive              |
| `marketing` | Campaigns, spend, attribution       | Meta Ads, Google Analytics, Google Drive |

Chat always runs inside one Expert. Switching Expert changes content,
available tools and accessible data. The Expert is the unit of isolation.

### 3.2. Chat with real data

The assistant answers through tools that query the database. **It does
not invent numbers**: if a fact is unavailable, it says so. The
technical detail lives in [05-ai](./05-ai.md).

The assistant can also **create and edit Google Drive documents** from
the chat and provide a share link.

### 3.3. Autonomous processes

A process is a sequence of steps with a trigger and an approval policy.
Planned processes:

| Process                   | Trigger                       | Approval   | Status   |
| ------------------------- | ----------------------------- | ---------- | -------- |
| Overdue invoice follow-up | Event · invoice due +7 days   | Required   | Active   |
| Campaign efficiency       | Threshold · CPA > target +30% | Required   | Active   |
| Pipeline health           | Cron · Friday 17:00           | None       | Active   |
| B2B lead generation       | Cron · Monday 08:00           | None       | Active   |
| Churn detection           | Cron · daily 06:00            | Dual sign. | Inactive |

When a process or chat action starts, **the system never applies the
change directly**: it generates a confirmation card with the exact
detail of the proposed change and the requester. Without explicit
approval, nothing is executed.

### 3.4. Governance: roles, permissions, traceability

- **Roles** in three levels (administrator, intermediate, reader),
  assigned per person. See [10-glossary](./10-glossary.md).
- **Per-Expert permissions** independent of role: one may administer
  sales without access to invoicing.
- **Activity log** of all relevant events: queries, executions,
  permission changes, denied access attempts, with author, time and
  result.
- **Revert:** any change can be reverted from the activity log.
  See [04-security](./04-security.md).

## 4. Usage

### 4.1. Access

Access uses Google accounts only — no passwords. Only accounts
pre-authorised by the administrator can sign in. The rationale is
documented in [04-security](./04-security.md).

### 4.2. Typical flow

1. Open the Experts panel.
2. Pick the Expert for the query (default: `general`).
3. Ask in natural language, e.g. "What is the state of the pipeline
   and which opportunities have not moved in three weeks?"
4. Get a structured response with the conclusion, a table and
   recommendations.

## 5. Current scope

| Capability                               | Status                         |
| ---------------------------------------- | ------------------------------ |
| Multi-user with roles                    | Active                         |
| Google Drive read/append                 | Active                         |
| Chat with tools and streaming            | Active                         |
| Per-Expert permissions and revert        | Active                         |
| Pipedrive, Holded, Salesforce            | Designed, awaiting credentials |
| Meta Ads, Google Analytics, Gmail, Slack | Designed, awaiting credentials |
| Local edition (`OPENEXPERT_MODE=local`)  | Active                         |
| Automatic trigger scheduler              | Pending                        |
| Self-hosted OpenExpert gateway           | Planned                        |

## 6. Editions

OpenExpert ships in two editions, both MIT-licensed and built from the
same source:

- **Cloud** — multi-user, hosted on Supabase + Vercel.
- **OpenCore local** — single owner, runs on your machine, no cloud.

See [11-opencore](./11-opencore.md) for the local edition and
[12-licensing](./12-licensing.md) for the licensing model.
