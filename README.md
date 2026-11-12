# AegisPay 🛡️ — Autonomous Dual-Sided Agentic Commerce, Synthetic Intent Clearinghouse & Multi-Modal Arbitration Cockpit

<div align="center">

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/vkk5880/paypal-agentic-cockpit)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.0-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Fastify 4](https://img.shields.io/badge/Fastify-4.28-black?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![Render Native](https://img.shields.io/badge/Render-Native_Workflows-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com)
[![PayPal Rails](https://img.shields.io/badge/PayPal-Orders_v2_|_Vault_v3-003087?style=for-the-badge&logo=paypal&logoColor=white)](https://developer.paypal.com)
[![AG Grid Enterprise](https://img.shields.io/badge/AG_Grid-Enterprise_v36-e02424?style=for-the-badge&logo=aggrid&logoColor=white)](https://www.ag-grid.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://opensource.org/licenses/MIT)

**Target Competition:** [Build What's Next with PayPal and AI Global Hackathon 2026](https://paypal-ai.devpost.com/)  
**Target Prize Pool:** **$34,500+ Combined Track Strategy**  
🏆 **Grand Prize ($12,000)** • 🤖 **Best Use of PayPal + AI ($5,000)** • ⚡ **Best Use of Agentic Commerce ($5,000)** • 🎥 **Best Demo Delivery ($5,000)**  
**Sponsor Prizes:** 📊 AG Grid / AG Studio 3 ($5,000) • 🛍️ Channel3 ($1,500) • 📐 APIMatic ($1,000) • ⏱️ Bryntum ($1,000) • ☁️ Render ($1,000 Credits)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vkk5880/paypal-agentic-cockpit)

[Live Demo Cockpit](http://localhost:3000) • [Pre-Authenticated Judge Portal](http://localhost:3000/judge) • [Interactive Chaos Simulator](http://localhost:3000/simulator) • [Architecture Guide](docs/PAYPAL_INTEGRATION.md)

</div>

---

## 📑 Table of Contents

- [1. Executive Summary & The Core Problem](#1-executive-summary--the-core-problem)
- [2. System Architecture & 5-Layer Defense-in-Depth Security Gate](#2-system-architecture--5-layer-defense-in-depth-security-gate)
- [3. Core Technical Moats & Architectural Innovations](#3-core-technical-moats--architectural-innovations)
- [4. 🏆 Hackathon Sponsor Track Alignment & Compliance Matrix](#4--hackathon-sponsor-track-alignment--compliance-matrix)
- [5. 🎬 3-Minute Hackathon Demo & Judge Walkthrough Guide](#5--3-minute-hackathon-demo--judge-walkthrough-guide)
- [6. ☁️ Production Deployment Guide (Render Blueprint & Manual)](#6-️-production-deployment-guide-render-blueprint--manual)
- [7. 💻 Local Development Quickstart](#7--local-development-quickstart)
- [8. 📂 Monorepo Directory Topology](#8--monorepo-directory-topology)
- [9. 🛡️ Agentic Commerce Protocol (ACP) & MCP Specification](#9-️-agentic-commerce-protocol-acp--mcp-specification)
- [10. 📊 Complete PayPal 18+ Endpoint Reference](#10--complete-paypal-18-endpoint-reference)
- [11. 📚 Documentation Index](#11--documentation-index)
- [12. 📜 License & Acknowledgements](#12--license--acknowledgements)

---

## 1. Executive Summary & The Core Problem

### The Dilemma of Autonomous AI Commerce
As artificial intelligence transitions from conversational search to **autonomous agentic action**, AI agents are increasingly tasked with procurement, price negotiation, multi-vendor cart compilation, and financial settlement. However, deploying autonomous agents directly against traditional financial rails creates critical failure modes:

1. **Adversarial Prompt Injection & Velocity Runaways:** An untrusted web page, malicious merchant description, or hijacked agent context can trick an AI agent into authorizing unauthorized, exorbitant charges before human review can intervene.
2. **Brittle Checkout & Rigid Margins:** High-value procurement baskets that exceed buyer budget caps by 5%–15% immediately fail, terminating transactions where buyers and merchants would otherwise gladly settle.
3. **Multi-Merchant Fragmentation:** Autonomous cross-vendor procurement requires fragmented checkouts, multiple shipping fees, and chaotic tracking.
4. **Post-Purchase Dispute & Return Fraud:** High return dispute volumes overwhelm merchant operations; resolving damaged or counterfeit returns takes days of manual photo comparison and carrier tracking audits.

### The AegisPay Solution
**AegisPay** is a production-grade, dual-sided autonomous agentic commerce platform and arbitration clearinghouse. It safely connects autonomous buyer agents with merchant operations backstopped by:
- **Zero-Trust Hardware WebCrypto Ed25519 Mandates** and single-threaded **Render Key-Value (Redis) Lua spend limiters** executing in `< 1ms` before PayPal APIs are touched.
- **1-Prompt Conversational Buying** via `assistant-ui` + Mastra + Gemini 2.5 Flash, paired with Fastlane by PayPal 1-click accelerated checkout.
- **Dynamic Synthetic Intent Bidding** anchored by live **PayPal Vault v3 Setup Tokens** for automated Dutch auction discount negotiations.
- **72-Hour Price-Drop Escrows** using durable **Render Workflows** (`@renderinc/sdk` v1.8.0) checkpointing during PayPal authorization windows.
- **12-Action Multimodal Dispute Forensics** pairing computer vision photo diffs, EXIF tamper detection, and in-memory `pdf-lib` dossiers directly uploaded to PayPal Disputes v1.
- **AG Grid Enterprise v36 + AG Studio 3 Cockpit** powered by client-side **DuckDB-WASM** for sub-10ms OLAP analysis over 100K+ transactions and Bryntum SLA scheduling.

---

## 2. System Architecture & 5-Layer Defense-in-Depth Security Gate

AegisPay enforces a strict zero-trust boundary. Every purchase intent—whether triggered by natural language in conversational chat, a single-click button in the UI, or an external ACP agent—must pass through 5 deterministic security gates:

```mermaid
flowchart TD
    UserPrompt["Customer Intent\n(Chat Prompt / 1-Click Cockpit / ACP Agent)"] --> L1

    subgraph DefensePipeline["5-Layer Zero-Trust Defense Pipeline"]
        L1["Layer 1: Scoped Auth & Token Inspection\n- JWT session validation\n- Read-Only tracking token isolation (/history)"]
        L1 -->|Valid Session| L2["Layer 2: WebCrypto Ed25519 Session Mandate\n- Asymmetric browser cryptographic signature\n- Enforces max_total, max_single_item, expiry"]
        L2 -->|Valid Signature| L3["Layer 3: Single-Threaded Atomic Redis Lua Enforcer\n- Sub-1ms execution in Render Key-Value\n- Atomic balance decrement & velocity limiter\n- Eliminates race conditions & prompt injection"]
        L3 -->|Within Budget| L4["Layer 4: Merchant Anomaly & Whitelist Gate\n- Filters domain whitelists & category rules\n- Rejects merchant anomaly score > 300 / 1000"]
        L4 -->|Low Risk| L5["Layer 5: PayPal Orders v2 Escrow Hold\n- Two-Phase Commit (2PC) inventory reservation\n- intent: 'AUTHORIZE' (no instant debit)\n- Initiates 72h Render Workflows price-drop watcher"]
    end

    L3 -- "Exceeds Budget" --> HITL["Step Down to HITL\n(1-Click Approval Card)"]
    L4 -- "High Risk" --> HITL
    L5 --> Success["Order Confirmed & Escrow Held\nPayPal Authorization ID Generated"]
```

### End-to-End System Component Topology

```mermaid
flowchart LR
    subgraph ClientLayer["Frontend Surface (apps/web-cockpit)"]
        BuyerPortal["Buyer Agent Portal\n- assistant-ui Chat\n- Flagship PDP\n- Fastlane v6 SDK"]
        MerchantPortal["Merchant Clearinghouse\n- AG Grid Enterprise v36\n- AG Studio 3 Canvas\n- Bryntum SLA Scheduler"]
        JudgeCockpit["Judge & Chaos Portal\n(/judge & /simulator)"]
    end

    subgraph GatewayLayer["API & Security Boundary (apps/api-orchestrator)"]
        FastifyGateway["Fastify 4 API Gateway\n(Port 4000)"]
        McpEnforcer["packages/mcp-enforcer\nMCP SDK v2 + Redis Lua"]
        KnapsackSolver["ILP Cart Optimizer\n(Channel3 API)"]
        MastraAgent["Mastra Agent DAG\n(Gemini 2.5 Flash)"]
    end

    subgraph DurableLayer["Cloud & Ledger (Render Cloud Fabric)"]
        RenderWorkflows["apps/workflows\n(@renderinc/sdk v1.8.0)\n- 72h Price Watcher\n- Vision Forensics"]
        RedisKV["Render Key-Value\n(Redis Lua noeviction)"]
        PostgresDB["Render Managed Postgres 16\n(Drizzle ORM Ledger)"]
        CronJob["Render Cron Reconciler\n(0 */6 * * *)"]
    end

    subgraph ExternalRails["External Commerce Rails"]
        PayPalAPI["PayPal REST APIs\n- Orders v2 / Payments v2\n- Vault v3 / Invoicing v2\n- Disputes v1 / Trackers v1"]
        Channel3API["Channel3 Catalog API\n(100M+ Products)"]
    end

    ClientLayer <-->|HTTPS / SSE| GatewayLayer
    GatewayLayer <--> DurableLayer
    GatewayLayer <--> ExternalRails
    RenderWorkflows <--> ExternalRails
```

---

## 3. Core Technical Moats & Architectural Innovations

### 1. 1-Prompt Autonomous Buy & Conversational Commerce
- **Modern Chat Interface**: Built on `@assistant-ui/react`, Next.js 15, and React 19, powered by `@mastra/core` and Google Gemini 2.5 Flash.
- **Fastify SSE Data Streaming**: Streams tokens, tool calls, and structured tool results in real time (`0:text`, `9:toolCall`, `a:toolResult`).
- **Turn-Level Attached Products**: Products discussed in each conversation turn are attached to chat turns, allowing users to compare items side-by-side or buy instantly.
- **Dual-Mode PayPal Authentication**:
  - **Mode A ($0 Identity Sign-In)**: Syncs cross-device history, cart state, and preferences without exposing financial credentials.
  - **Mode B (Spend Allowance Mandate)**: Binds an authenticated **PayPal Vault v3 Setup Token** with hardware-signed **Ed25519 SessionMandates**, unlocking true **1-prompt buying** (*"Buy Sony XM5 under $300"* completes in one prompt without modals).
- **Read-Only Tracking Link Isolation**: Order receipts (`/history?order_id=...&token=...`) use isolated cryptographic scopes, preventing unauthorized spend actions from shared links.

### 2. Universal Flagship Product Detail Experience (PDP)
- **Flagship Route (`/products/[productId]`) & Modal (`<ProductDetailModal />`)**: Inspired by Apple and Nike flagship eCommerce design.
- **Multi-Angle Studio Gallery**: Interactive image zoom with a 4-tier fallback cascade (`cleaned_url` $\rightarrow$ `cleaned_image_url` $\rightarrow$ `image_url` $\rightarrow$ SVG fallback).
- **Channel3 Multi-Merchant Price Matrix**: Real-time side-by-side merchant price comparison, stock verification, and instant cashback calculations.
- **Two-Phase Commit (2PC) Stock Reservation**: Verifies and temporarily holds merchant inventory before dispatching PayPal authorizations.

### 3. Zero-Trust MCP Server & Official `@paypal/agent-toolkit` Bridge
- **MCP TypeScript SDK v2**: Implements modular `@modelcontextprotocol/core` and `@modelcontextprotocol/server` under the 2026-07-28 protocol standard.
- **Official PayPal Agent Toolkit Bridge**: Wraps `@paypal/agent-toolkit` and `@paypal/mcp` (`PayPalAgentToolkit` v1.11.0) behind our proxy enforcer.
- **Sub-1ms Redis Lua Atomic Spend Enforcer**: Single-threaded Lua script on Render Key-Value (`maxmemoryPolicy: noeviction`) decrements mandate balances atomically, preventing race conditions and runaway prompt injections before touching PayPal APIs.

### 4. Fastlane by PayPal 1-Click Guest Checkout
- Embedded in `PayPalV6SdkMount.tsx` using the PayPal JS SDK v6 Web Components runtime.
- Accelerates guest authentication via device-authenticated email lookup and passwordless card retrieval, seamlessly bridging into Vault v3 delegated spending.

### 5. Multi-Vendor Knapsack Cart Optimizer
- Queries Channel3 (`/v1/search` and `/v1/lookup` with promo code `PAYPAL-HACKATHON-2026` for 20,000 credits).
- Formulates and solves an Integer Linear Programming (ILP) Knapsack problem: maximizes affiliate commission rebates ($\alpha = 0.75$), minimizes shipping costs across vendor free-shipping thresholds, and compiles the result into a single **PayPal Orders v2 Multi-Purchase-Unit `AUTHORIZE`** payload with individual merchant `payee` routing.

### 6. Synthetic Intent Bidding & Vault v3 Negotiation
- When a buyer's desired cart exceeds their budget cap by 5%–18%, the Buyer Agent mints a cryptographically bound **Synthetic Intent Voucher** anchored by a live **PayPal Vault v3 Setup Token (`/v3/vault/setup-tokens`)**.
- The merchant pricing engine runs a 2-turn bounded Dutch auction counter-bidding engine. When accepted, the token is converted to a captured order in $< 1\text{s}$. If margin bounds fail, it falls back to a 60-second Human-in-the-Loop (HITL) card.

### 7. 72-Hour Price-Drop Escrow via Render Workflows
- Built on the official `@renderinc/sdk` v1.8.0 using native `flow()` and durable `ctx.step()` checkpointing.
- Monitors Channel3 product pricing during PayPal's 72-hour authorization window. If prices drop, it automatically captures the lower amount (`POST /v2/payments/authorizations/{id}/capture`) and credits the difference back to the buyer.
- Supports 29-day authorization extensions via `reauthorizeAuthorization` (`POST /v2/payments/authorizations/{id}/reauthorize`).

### 8. 12-Action Multimodal Dispute Arbiter & Forensic Evidence Dossier
- Full APIMatic-grounded coverage of PayPal Disputes v1 with dynamic HATEOAS link resolution (`/provide-evidence`, `/make-offer`, `/acknowledge-return-item`, `/accept-claim`, `/appeal`).
- Compares pristine studio photos against buyer return photos using Computer Vision and EXIF metadata analysis to compute an orthogonal Liability-Risk score $(L, R) \in [0, 1]^2$.
- Generates in-memory forensic evidence PDFs with `pdf-lib` and uploads them via `multipart/form-data` to PayPal's evidence endpoint. Produces automated 4x6 return shipping labels with scannable QR codes for valid returns.

### 9. AG Grid Enterprise v36 + AG Studio 3 Clearinghouse Cockpit
- **AG Grid Enterprise v36.3.0**: Centralized module registry (`enterpriseModules.ts`), Quartz dynamic theming engine with light/dark synchronization (`useAgGridTheme.ts`), and 6 custom React cell renderers (HATEOAS hold buttons, SVG radial risk meters, photo comparison diffs, carrier trackers, SLA countdowns).
- **Master/Detail Hierarchical Grids**: Child sub-grids (`OrderDetailView`, `DisputeDetailView`) for inspecting multi-payee purchase units, Vault setup tokens, and forensic dispute dossiers.
- **DuckDB-WASM SSRM OLAP Bridge**: AG Grid Server-Side Row Model powered directly by in-browser DuckDB-WASM for sub-10ms SQL queries over 100K+ synthetic records.
- **Integrated AG Charts & Sparklines**: In-cell area sparklines for 30-day liquidity trends and column sparklines for synthetic bid velocity.
- **Live AG Studio 3 Canvas**: Active `<LiveStudioCanvas />` with multi-agent harness (`setupStudioHarness`), custom `paypal_arbiter` runner, and a natural language command prompt bar.
- **Multi-Sheet Native Excel Export**: Native `.xlsx` workbook generation with frozen headers and formatted currency cells (`exportDataAsExcel`).

### 10. Bryntum SLA Scheduler Integration
- Integrates `@bryntum/scheduler-trial` in the Merchant Arbitration Cockpit.
- Features a prominent **"Unallocated SLA Deadline"** badge, color-coded urgency indicators (Red <6h, Yellow vision triage, Green submitted), and a 1-click **"Imminent Breach"** filter to prevent forfeiture of PayPal dispute response windows.

---

## 4. 🏆 Hackathon Sponsor Track Alignment & Compliance Matrix

AegisPay was designed from day one to aggressively satisfy every requirement of the **PayPal Global Hackathon 2026** and all 5 sponsor categories:

| Sponsor Track | Prize Pool | AegisPay Integration & Technical Proof | Code Reference |
| :--- | :---: | :--- | :--- |
| **PayPal Core & Agentic Commerce** | **$27,000**<br/>*(Grand Prize, AI, Agentic, Demo)* | Grounded integration of **18+ PayPal endpoints**: Orders v2 (Multi-Purchase Units, Authorize/Capture), Payments v2 (29-day Reauth, Partial Captures), Vault v3 (Setup Tokens, Payment Tokens), Invoicing v2 (CRUD, Reminders, QR codes), Disputes v1 (12 HATEOAS actions, Evidence, Appeals), Shipment Tracking v1, Fastlane checkout, and Webhooks v1 signature validation. | [`apps/api-orchestrator/src/services/paypal/`](apps/api-orchestrator/src/services/paypal/)<br/>[`docs/PAYPAL_INTEGRATION.md`](docs/PAYPAL_INTEGRATION.md) |
| **AG Grid / AG Studio 3** | **$5,000**<br/>*(1st Place Track)* | **AG Grid Enterprise v36.3.0 Suite**: Dynamic Quartz theming, Master/Detail nested order grids, 6 custom React cell renderers, DuckDB-WASM SSRM bridge (`DuckDbServerSideDatasource`), in-cell area/column sparklines, row grouping, pivot mode, real-time streaming flash (`applyTransactionAsync`), and native multi-sheet Excel export.<br/>**AG Studio 3**: Live `<LiveStudioCanvas />` with multi-agent harness (`setupStudioHarness`), custom `paypal_arbiter` client tool runner, and natural language command prompt bar. | [`apps/web-cockpit/src/components/ag-studio/`](apps/web-cockpit/src/components/ag-studio/)<br/>[`apps/web-cockpit/src/components/merchant/DataGrid.tsx`](apps/web-cockpit/src/components/merchant/DataGrid.tsx)<br/>[`docs/AG_GRID.md`](docs/AG_GRID.md) |
| **Channel3** | **$1,500** | Multimodal product catalog discovery across 100M+ products via Channel3 API (`/v1/search` using text, images, categories, and hex colors) with promo code `PAYPAL-HACKATHON-2026` (20,000 credits). Two-Phase Commit (2PC) inventory pre-check, affiliate commission rebate subsidy solver ($\alpha = 0.75$), and 72-hour price-drop polling. | [`apps/api-orchestrator/src/services/cart-solver.ts`](apps/api-orchestrator/src/services/cart-solver.ts)<br/>[`apps/workflows/src/tasks/price-drop-watcher.ts`](apps/workflows/src/tasks/price-drop-watcher.ts) |
| **APIMatic** | **$1,000** | Grounded initialization of `@paypal/paypal-server-sdk` using APIMatic-validated patterns: strict model deserialization, fault injection headers (`PayPal-Mock-Response`), idempotency keys (`PayPal-Request-Id`), and comprehensive integration documentation in `docs/APIMATIC.md`. | [`apps/api-orchestrator/src/services/paypal/paypal-client.ts`](apps/api-orchestrator/src/services/paypal/paypal-client.ts)<br/>[`docs/APIMATIC.md`](docs/APIMATIC.md) |
| **Bryntum** | **$1,000** | Embedded `@bryntum/scheduler-trial` in the Merchant Cockpit with an active **"Unallocated SLA Deadline"** badge, color-coded urgency bands (Red <6h, Yellow vision triage, Green submitted), and a 1-click **"Imminent Breach"** filter to auto-assign dispute resolution shifts. | [`apps/web-cockpit/src/components/bryntum/DisputeSlaScheduler.tsx`](apps/web-cockpit/src/components/bryntum/DisputeSlaScheduler.tsx) |
| **Render** | **$1,000**<br/>*(Platform Credits)* | Cloud-native multi-service deployment via declarative `render.yaml` Blueprint IaC: Native Render Workflows (`type: workflow`, `@renderinc/sdk` v1.8.0), Render Key-Value Redis (`type: keyvalue`, `noeviction` Lua spend enforcer), Managed PostgreSQL 16 (`databases`), Render Web Services (`type: web`), and Scheduled Cron Reconciler (`type: cron`, `0 */6 * * *`). | [`render.yaml`](render.yaml)<br/>[`docs/RENDER.md`](docs/RENDER.md) |

---

## 5. 🎬 3-Minute Hackathon Demo & Judge Walkthrough Guide

Judges can evaluate the complete system in **under 3 minutes** using the pre-authenticated, zero-friction Judge Cockpit at:  
👉 **`http://localhost:3000/judge`** (or deployed URL: `/judge`)

```
====================================================================================
                        AEGISPAY 3-MINUTE DEMO RUNBOOK
====================================================================================
[0:00 - 0:45] ACT 1: ADVERSARIAL PROMPT INJECTION SHIELD
  Narrative : Autonomous shopping agent receives an injected prompt attempting a
              $5,000 unauthorized transaction over a $500 buyer spend cap.
  Action    : In /judge, click "[Trigger $5,000 Injection Attack]".
  Outcome   : Single-threaded Redis Lua firewall rejects the attempt in < 1ms
              (ERR_EXCEEDS_TOTAL_MANDATE_BUDGET) before any PayPal API is called.
------------------------------------------------------------------------------------
[0:45 - 1:30] ACT 2: SYNTHETIC INTENT HAGGLE & VAULT V3 AUTHORIZATION
  Narrative : Buyer wants a $490 workstation bundle but has a $450 budget cap (8.9% gap).
  Action    : Click "[Trigger Synthetic Bid ($450)]".
  Outcome   : Buyer Agent mints a SyntheticIntentVoucher backed by a live PayPal
              Vault v3 Setup Token. The merchant engine accepts the bid, converting
              it to an authorized PayPal order instantly.
------------------------------------------------------------------------------------
[1:30 - 2:15] ACT 3: DAMAGED RETURN DISPUTE FORENSICS & AUTO-ADJUDICATION
  Narrative : Fraudulent or damaged return claim filed. SLA deadline is imminent.
  Action    : Click "[Auto-Adjudicate Dispute]".
  Outcome   : Render Workflow runs computer vision comparison (Channel3 pristine vs.
              buyer return photo), compiles an in-memory pdf-lib forensic dossier,
              streams it to PayPal Disputes v1 (/provide-evidence), and auto-settles.
------------------------------------------------------------------------------------
[2:15 - 3:00] ACT 4: KNAPSACK MULTI-VENDOR SPLIT & 72H ESCROW PRICE DROP
  Narrative : Cross-merchant procurement with guaranteed price protection.
  Action    : Click "[Trigger Knapsack + 72h Drop]".
  Outcome   : Knapsack solver splits items across merchants, waives shipping, passes
              commission rebates, and places a PayPal Orders v2 AUTHORIZE hold.
              Workflow detects a 15% price drop on Channel3, capturing the lower
              price ($403.75) and auto-refunding the difference to the buyer.
====================================================================================
```

### Live Sandbox Chaos Simulator (`/simulator`)
The Chaos Simulator allows judges to inject authentic `PayPal-Mock-Response` headers into live Sandbox calls:
- `INSTRUMENT_DECLINED`: Verifies compensating Redis Lua rollbacks and financial ledger balance restoration.
- `COMPLIANCE_VIOLATION`: Confirms policy rejections and immediate security logging.

---

## 6. ☁️ Production Deployment Guide (Render Blueprint & Manual)

AegisPay is engineered for one-click deployment on **Render** via Infrastructure-as-Code (`render.yaml`).

### Option A: 1-Click Render Blueprint Deployment (Recommended)

1. Click the **Deploy to Render** button:
   
   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vkk5880/paypal-agentic-cockpit)

2. In the Render Dashboard:
   - Provide your environment variables (or let Render generate secrets).
   - Click **Apply**.
3. Render automatically provisions:
   - `aegispay-postgres` (Managed PostgreSQL 16)
   - `aegispay-redis` (Render Key-Value with `noeviction` Lua engine)
   - `aegispay-api-orchestrator` (Fastify 4 Web Service + automated `preDeployCommand` migrations + `initialDeployHook` 1,000 sandbox records)
   - `aegispay-web-cockpit` (Next.js 15 Web Service)
   - `aegispay-workflows` (Render Workflows Service)
   - `aegispay-cron-reconciler` (Scheduled Cron Service running `0 */6 * * *`)

### Option B: Step-by-Step Manual Deployment

#### 1. Provision Managed PostgreSQL & Redis
- **PostgreSQL 16**: Create a Render PostgreSQL database named `aegispay`. Copy its internal `DATABASE_URL`.
- **Redis / Render Key-Value**: Create a Key-Value instance with `maxmemoryPolicy: noeviction`. Copy its internal `REDIS_URL`.

#### 2. Run Database Migrations & Seeding
```bash
# Build database package and push schema
pnpm --filter @aegispay/database build
pnpm --filter @aegispay/database db:push

# Seed 1,000 deterministic sandbox records
pnpm --filter @aegispay/database run db:seed
```

#### 3. Deploy API Orchestrator (`apps/api-orchestrator`)
- **Runtime**: Node 22
- **Build Command**: `pnpm install --frozen-lockfile --prod=false && pnpm --filter @aegispay/api-orchestrator build`
- **Start Command**: `pnpm --filter @aegispay/api-orchestrator start`
- **Health Check Path**: `/api/integrations/verify`

#### 4. Deploy Web Cockpit (`apps/web-cockpit`)
- **Runtime**: Node 22
- **Build Command**: `pnpm install --frozen-lockfile --prod=false && pnpm --filter @aegispay/web-cockpit build`
- **Start Command**: `pnpm --filter @aegispay/web-cockpit start`
- **Health Check Path**: `/api/health`

#### 5. Deploy Workflows Service (`apps/workflows`)
- **Runtime**: Node 22
- **Build Command**: `pnpm install --frozen-lockfile --prod=false && pnpm --filter @aegispay/workflows build`
- **Start Command**: `pnpm --filter @aegispay/workflows start`

---

### Environment Variables Reference Table

| Variable | Required | Description | Example / Default |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **Yes** | PostgreSQL 16 connection string | `postgresql://user:pass@host:5432/aegispay` |
| `REDIS_URL` | **Yes** | Redis connection string for Lua spend limiter | `redis://localhost:6379` |
| `PAYPAL_CLIENT_ID` | **Yes** | PayPal Developer Sandbox App Client ID | `A...` |
| `PAYPAL_CLIENT_SECRET` | **Yes** | PayPal Developer Sandbox App Secret | `E...` |
| `PAYPAL_WEBHOOK_ID` | Optional | PayPal Webhook ID for signature verification | `WH-...` (auto-registered if empty) |
| `PAYPAL_ENVIRONMENT` | Optional | PayPal environment mode (`sandbox` or `live`) | `sandbox` |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | **Yes** | Client-side PayPal Client ID for SDK mount | Same as `PAYPAL_CLIENT_ID` |
| `CHANNEL3_API_KEY` | Optional | Channel3 Sponsored API Key | `ch3_live_...` (falls back to mock catalog) |
| `CHANNEL3_PROMO_CODE` | Optional | Channel3 Hackathon Promo Code | `PAYPAL-HACKATHON-2026` |
| `COMMERCE_AGENT_MODEL` | Optional | LLM identifier for Mastra shopping assistant | `google/gemini-3.5-flash-lite` |
| `GEMINI_API_KEY` | Optional | Google Gemini API Key for vision & chat | `AIzaSy...` |
| `NEXT_PUBLIC_DEV_TOOLS` | Optional | Expose Judge & Chaos Lab navigation in UI | `true` |
| `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` | Optional | AG Grid Enterprise License Key | Blank for evaluation watermark |
| `LOG_LEVEL` | Optional | Pino & console logging verbosity | `info` or `debug` |

---

## 7. 💻 Local Development Quickstart

### Prerequisites
- **Node.js** >= 20.x (Node 22 recommended)
- **pnpm** >= 9.x (`npm install -g pnpm`)
- **PostgreSQL** 16 & **Redis** (local instances or Docker)

### 1-Minute Setup

```bash
# 1. Clone the repository
git clone https://github.com/vkk5880/paypal-agentic-cockpit.git
cd paypal-agentic-cockpit

# 2. Copy environment configuration
cp .env.example .env

# 3. Install all workspace dependencies
pnpm install

# 4. Synchronize database schema & seed 1,000 deterministic records
pnpm --filter @aegispay/database db:push
pnpm --filter @aegispay/database db:seed

# 5. Start all services concurrently (Turbo dev)
pnpm dev
```

The services will be available at:
- **Buyer & Merchant Cockpit**: `http://localhost:3000`
- **Pre-Authenticated Judge Lab**: `http://localhost:3000/judge`
- **Fastify Financial Orchestrator**: `http://localhost:4000`
- **Health & Integration Diagnostics**: `http://localhost:4000/api/integrations/verify`

### Run Verification & Test Suites

```bash
# Run tests across all monorepo packages (345+ unit & integration tests)
pnpm test

# Run tests for specific packages
pnpm --filter @aegispay/shared-types test
pnpm --filter @aegispay/api-orchestrator test
pnpm --filter @aegispay/web-cockpit test

# Build the entire monorepo
pnpm build
```

---

## 8. 📂 Monorepo Directory Topology

```
aegispay/
├── apps/
│   ├── api-orchestrator/           # Fastify 4 port 4000: Financial Clearinghouse & MCP Gateway
│   │   ├── src/
│   │   │   ├── routes/             # ACP, buyer procurement, chat, dispute, HITL, catalog
│   │   │   ├── services/paypal/    # 18+ PayPal endpoints, server SDK, webhooks
│   │   │   ├── services/cart-solver.ts # ILP Knapsack multi-merchant optimizer
│   │   │   └── services/shopping-assistant.ts # Mastra Agent + Gemini 2.5 Flash
│   │   └── package.json
│   │
│   ├── web-cockpit/                # Next.js 15 + React 19: Dual-Sided UI & Clearinghouse
│   │   ├── src/
│   │   │   ├── app/(buyer)/        # Conversational Chat, Flagship PDP, Search, Watchlist, History
│   │   │   ├── app/(merchant)/     # AG Grid Enterprise, AG Studio 3 Canvas, Bryntum SLA Scheduler
│   │   │   ├── app/judge/          # Pre-authenticated 3-minute Hackathon Evaluation Lab
│   │   │   ├── app/simulator/      # Chaos negative testing console (Mock Headers)
│   │   │   ├── components/ag-studio/ # AG Studio 3 custom harnesses & widgets
│   │   │   ├── components/bryntum/  # Bryntum SLA dispute schedule visualizer
│   │   │   └── components/buyer/   # assistant-ui chat, product cards, Fastlane mount
│   │   └── package.json
│   │
│   └── workflows/                  # Render Workflows (@renderinc/sdk v1.8.0)
│       ├── src/
│       │   ├── tasks/price-drop-watcher.ts  # 72h durable Channel3 price-drop polling
│       │   ├── tasks/dispute-arbiter.ts     # Multimodal vision forensics & pdf-lib dossiers
│       │   ├── tasks/synthetic-matcher.ts   # Dutch auction decay & matching
│       │   └── tasks/fulfillment-watcher.ts # Carrier exception tracker
│       └── package.json
│
├── packages/
│   ├── database/                   # Drizzle ORM + PostgreSQL 16 schema & 1,000-row seeder
│   ├── mcp-enforcer/               # Standalone MCP v2 Server + Redis Lua atomic spend limiter
│   └── shared-types/               # Canonical Zod contracts, ACP schemas & TypeScript types
│
├── spec/                           # Official ACP 2026-04-17 & unreleased specification bundles
├── docs/                           # Comprehensive technical guides & dossiers
│   ├── PAYPAL_INTEGRATION.md       # 18-Endpoint PayPal architecture guide
│   ├── AG_GRID.md                  # AG Grid Enterprise & AG Studio 3 guide
│   ├── RENDER.md                   # Render Workflows & cloud infrastructure dossier
│   ├── APIMATIC.md                 # APIMatic SDK verification log
│   └── DEMO_VIDEO_SCRIPT.md        # Second-by-second 3-minute demo script
│
├── render.yaml                     # Declarative Render Blueprint (Web, Workflows, Cron, PG, Redis)
├── turbo.json                      # Turborepo build caching pipeline
└── package.json                    # Monorepo root workspace configuration
```

---

## 9. 🛡️ Agentic Commerce Protocol (ACP) & MCP Specification

AegisPay natively implements the **Agentic Commerce Protocol (ACP)** specification maintained by OpenAI & Stripe, serving as an autonomous dual-sided clearinghouse.

### Discovery & Versioning
- **Discovery Endpoint**: `GET /.well-known/acp.json`
- **Supported API Versions**: `2025-09-29`, `2025-12-12`, `2026-01-16`, `2026-01-30`, `2026-04-17` (Active Standard)
- **Advertised Transports**: `rest` (HTTPS REST) and `mcp` (Streamable HTTP JSON-RPC 2.0)

### MCP Checkout Tools
AegisPay exposes 5 canonical checkout tools over Model Context Protocol (`POST /mcp`):
1. `create_checkout_session`: Initiates session with tax estimation and shipping calculation.
2. `get_checkout_session`: Retrieves authoritative cart state and line-item totals.
3. `update_checkout_session`: Full replacement update of line items or fulfillment data.
4. `complete_checkout_session`: Finalizes payment via Vault v3 or Ed25519 mandate.
5. `cancel_checkout_session`: Cancels session with structured `intent_trace` telemetry.

---

## 10. 📊 Complete PayPal 18+ Endpoint Reference

| # | Endpoint / Resource | HTTP Method | PayPal API Service | Purpose in AegisPay |
| :---: | :--- | :---: | :--- | :--- |
| **1** | `/v1/oauth2/token` | `POST` | Auth v1 | Exchanges app credentials for scoped OAuth2 Bearer tokens |
| **2** | `/v3/vault/setup-tokens` | `POST` | Vault v3 | Mints vault tokens for autonomous buyer synthetic intent bids |
| **3** | `/v3/vault/payment-tokens` | `POST` | Vault v3 | Permanently vaults customer cards/wallets for 1-prompt checkout |
| **4** | `/v3/vault/payment-tokens` | `GET` | Vault v3 | Lists stored customer payment methods for delegated agent checkout |
| **5** | `/v2/checkout/orders` | `POST` | Orders v2 | Multi-purchase-unit order authorization with separate merchant payees |
| **6** | `/v2/checkout/orders/{id}` | `GET` | Orders v2 | Retrieves authoritative order status, payee splits, and escrow hold state |
| **7** | `/v2/checkout/orders/{id}/authorize` | `POST` | Orders v2 | Places conditional hold on vaulted funds pending 72h price drops |
| **8** | `/v2/checkout/orders/{id}/capture` | `POST` | Orders v2 | Captures pre-authorized funds upon merchant acceptance |
| **9** | `/v2/payments/authorizations/{id}/reauthorize` | `POST` | Payments v2 | Extends authorization validity windows up to 29 days |
| **10** | `/v2/payments/authorizations/{id}/capture` | `POST` | Payments v2 | Performs partial captures (`final_capture: false`) for staged shipments |
| **11** | `/v2/payments/captures/{id}/refund` | `POST` | Payments v2 | Executes instant partial or full refunds from dispute settlements |
| **12** | `/v1/customer/disputes` | `GET` | Disputes v1 | Paginated discovery of open merchant claims and chargebacks |
| **13** | `/v1/customer/disputes/{id}` | `GET` | Disputes v1 | Retrieves dispute state, HATEOAS action links, and evidence requirements |
| **14** | `/v1/customer/disputes/{id}/provide-evidence` | `POST` | Disputes v1 | Uploads `multipart/form-data` in-memory `pdf-lib` forensic evidence |
| **15** | `/v1/customer/disputes/{id}/appeal` | `POST` | Disputes v1 | Submits automated appeals for lost claims or carrier-confirmed deliveries |
| **16** | `/v1/shipping/trackers-batch` | `POST` | Trackers v1 | Batches normalized shipment tracking data (`USPS`, `FEDEX`, `UPS`) |
| **17** | `/v2/invoicing/invoices` | `POST` | Invoicing v2 | Mints autonomous B2B draft invoices with line items and discounts |
| **18** | `/v2/invoicing/invoices/{id}/generate-qr-code` | `POST` | Invoicing v2 | Produces scannable Base64 PNG QR codes for instant mobile payment |
| **19** | `/v1/notifications/verify-webhook-signature` | `POST` | Webhooks v1 | Cryptographically validates PayPal event payloads before Redis locking |

---

## 11. 📚 Documentation Index

Explore our comprehensive technical dossiers and guides:

| Document | Description |
| :--- | :--- |
| [📘 PayPal Developer Modernization Guide](docs/PAYPAL_INTEGRATION.md) | Deep dive into all 18+ integrated PayPal endpoints, authentication patterns, and chaos testing |
| [📊 AG Grid Enterprise & AG Studio 3 Guide](docs/AG_GRID.md) | Full documentation of our custom React cell renderers, DuckDB-WASM SSRM bridge, and studio canvas |
| [☁️ Render Cloud Infrastructure Dossier](docs/RENDER.md) | Complete guide to our multi-service `render.yaml` Blueprint, Workflows, and Redis Lua spend enforcer |
| [📐 APIMatic SDK Verification Dossier](docs/APIMATIC.md) | Verification and audit log of APIMatic-grounded `@paypal/paypal-server-sdk` initialization |
| [🎬 3-Minute Video Demo Script](docs/DEMO_VIDEO_SCRIPT.md) | Second-by-second video presentation script for the Devpost hackathon submission |

---

## 12. 📜 License & Acknowledgements

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

### Hackathon Team & Acknowledgements
- Built with pride for the **Build What's Next with PayPal and AI Global Hackathon 2026**.
- Special thanks to the sponsor teams at **PayPal**, **AG Grid**, **Channel3**, **APIMatic**, **Bryntum**, and **Render** for developer tooling and sponsor prize challenges.

<div align="center">
  <sub>AegisPay 🛡️ — Built with Next.js 15, Fastify 4, Render Workflows, AG Grid Enterprise, and PayPal Rails.</sub>
</div>
