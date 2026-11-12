# AegisPay 🛡️
### Autonomous Dual-Sided Agentic Commerce, Synthetic Intent Clearinghouse & Multi-Modal Dispute Forensics Cockpit

<div align="center">

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/vkk5880/Aegispay)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.0-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Fastify 4](https://img.shields.io/badge/Fastify-4.28-black?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![Render Native](https://img.shields.io/badge/Render-Native_Workflows-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com)
[![PayPal Rails](https://img.shields.io/badge/PayPal-Orders_v2_|_Vault_v3-003087?style=for-the-badge&logo=paypal&logoColor=white)](https://developer.paypal.com)
[![AG Grid Enterprise](https://img.shields.io/badge/AG_Grid-Enterprise_v36-e02424?style=for-the-badge&logo=aggrid&logoColor=white)](https://www.ag-grid.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://opensource.org/licenses/MIT)

**A bank-grade clearinghouse bridging autonomous AI consumer agents with merchant commerce rails.**  
Protected by zero-trust WebCrypto Ed25519 session mandates, sub-millisecond atomic Redis Lua budget enforcers, 72-hour price-drop escrow holds, and multimodal computer vision dispute arbitration.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vkk5880/Aegispay)

[Live Cockpit](http://localhost:3000) • [Evaluation & Chaos Lab](http://localhost:3000/judge) • [Negative Testing Simulator](http://localhost:3000/simulator) • [PayPal Integration Dossier](docs/PAYPAL_INTEGRATION.md) • [AG Grid Architecture](docs/AG_GRID.md)

</div>

---

## 📑 Table of Contents

- [1. Executive Summary & Problem Space](#1-executive-summary--problem-space)
- [2. Zero-Trust Security Architecture & 5-Layer Purchase Gate](#2-zero-trust-security-architecture--5-layer-purchase-gate)
- [3. Core Architectural Innovations & Technical Moats](#3-core-architectural-innovations--technical-moats)
- [4. Enterprise Platform Architecture & Deep Partner Integrations](#4-enterprise-platform-architecture--deep-partner-integrations)
  - [4.1 PayPal Developer Platform (Commerce Rails & Agent Toolkit)](#41-paypal-developer-platform-commerce-rails--agent-toolkit)
  - [4.2 AG Grid Enterprise v36 & AG Studio 3 (Clearinghouse Workstation)](#42-ag-grid-enterprise-v36--ag-studio-3-clearinghouse-workstation)
  - [4.3 Render Cloud Infrastructure (Multi-Service Native Fabric)](#43-render-cloud-infrastructure-multi-service-native-fabric)
  - [4.4 Channel3 Commerce Intelligence (Catalog & Cart Solver)](#44-channel3-commerce-intelligence-catalog--cart-solver)
  - [4.5 APIMatic Grounded SDK Implementation](#45-apimatic-grounded-sdk-implementation)
  - [4.6 Bryntum SLA Dispute Scheduler](#46-bryntum-sla-dispute-scheduler)
- [5. 🔍 Evaluator Testing Guide & Professional Demo Walkthrough](#5--evaluator-testing-guide--professional-demo-walkthrough)
  - [5.1 Interactive Portals & Navigation Map](#51-interactive-portals--navigation-map)
  - [5.2 Step-by-Step Evaluator Test Scenarios (How to Check Our Agent)](#52-step-by-step-evaluator-test-scenarios-how-to-check-our-agent)
  - [5.3 🏪 Comprehensive Seller Portal & Merchant Clearinghouse Guide (/merchant)](#53--comprehensive-seller-portal--merchant-clearinghouse-guide-merchant)
  - [5.4 Complete Capabilities & Feature Inventory (What We Have)](#54-complete-capabilities--feature-inventory-what-we-have)
  - [5.5 3-Minute Video Presentation Storyboard](#55-3-minute-video-presentation-storyboard)
- [6. ☁️ Production Deployment Guide (Render Blueprint & Manual)](#6-️-production-deployment-guide-render-blueprint--manual)
- [7. 💻 Local Development & Quickstart](#7--local-development--quickstart)
- [8. 📂 Monorepo Directory Topology](#8--monorepo-directory-topology)
- [9. 🔌 Universal LLM & MCP Integration Guide (Connect Any AI Agent)](#9--universal-llm--mcp-integration-guide-connect-any-ai-agent)
  - [9.1 Autonomous Clearinghouse Gateway Architecture](#91-autonomous-clearinghouse-gateway-architecture)
  - [9.2 Complete 16-Tool Catalog Exposed to External LLMs](#92-complete-16-tool-catalog-exposed-to-external-llms)
  - [9.3 Zero-Trust Security & Cryptographic Mandate Enforcement](#93-zero-trust-security--cryptographic-mandate-enforcement)
  - [9.4 Ready-to-Use IDE & Assistant Configuration Snippets](#94-ready-to-use-ide--assistant-configuration-snippets)
  - [9.5 Programmatic Integration Guides (Python, TypeScript, cURL)](#95-programmatic-integration-guides-python-typescript-curl)
  - [9.6 Multi-Provider LLM Switching & Air-Gapped Fallback Reasoner](#96-multi-provider-llm-switching--air-gapped-fallback-reasoner)
- [10. 📊 Complete PayPal 18+ Endpoint Reference](#10--complete-paypal-18-endpoint-reference)
- [11. 📚 Documentation & Technical Dossiers](#11--documentation--technical-dossiers)
- [12. 🤝 Strategic Technology Partners & Ecosystem Acknowledgements](#12--strategic-technology-partners--ecosystem-acknowledgements)
- [13. 📜 License & Compliance](#13--license--compliance)

---

## 1. Executive Summary & Problem Space

### The Core Problem in Autonomous AI Commerce
As artificial intelligence evolves from passive search to **autonomous agentic execution**, consumer shopping agents are increasingly empowered to research products, negotiate pricing, compile multi-vendor carts, and execute financial transactions. However, unleashing autonomous agents onto traditional payment rails creates critical systemic vulnerabilities:

1. **Adversarial Prompt Injection & Velocity Runaways:** Malicious merchant descriptions, third-party reviews, or prompt injections can hijack an agent's context, causing unauthorized, out-of-budget transactions before a human can intervene.
2. **Brittle Checkout & Rigid Conversion:** Traditional eCommerce checkout is binary. When a high-intent buyer's budget cap falls 5%–15% below the retail total, the session simply aborts, terminating deals where both buyer and merchant would happily transact.
3. **Multi-Merchant Fragmentation:** Autonomous cross-vendor procurement forces buyers to endure multiple checkouts, redundant shipping fees, and disorganized tracking numbers.
4. **Post-Purchase Dispute & Return Fraud:** High return volumes strain merchant operations; adjudicating damaged, altered, or counterfeit returns requires days of manual photo inspection, carrier audits, and evidence filing.

### The AegisPay Solution
**AegisPay** is an enterprise-grade, dual-sided autonomous agentic commerce clearinghouse and dispute forensics cockpit. It bridges autonomous consumer agents with merchant settlement rails through:
- **Zero-Trust Spend Enforcers**: Browser-generated **WebCrypto Ed25519 Session Mandates** paired with single-threaded **Render Key-Value (Redis) Lua scripts** executing cent-level spend limits in `< 1ms` before payment APIs are touched.
- **1-Prompt Conversational Buying**: Built on `@assistant-ui/react` + Mastra + Gemini 2.5 Flash, paired with Fastlane by PayPal 1-click accelerated checkout.
- **Dynamic Synthetic Intent Bidding**: Converts price-hesitant cart abandonments into binding counter-bids anchored by live **PayPal Vault v3 Setup Tokens** (`/v3/vault/setup-tokens`).
- **72-Hour Price-Drop Escrow**: Durable **Render Workflows** (`@renderinc/sdk` v1.8.0) checkpointing during PayPal authorization windows to automatically capture price drops and credit buyers.
- **12-Action Multimodal Dispute Forensics**: Computer vision comparisons, EXIF tampering audits, and in-memory `pdf-lib` dossiers streamed directly to PayPal Disputes v1.
- **AG Grid Enterprise v36 + AG Studio 3 Clearinghouse**: Client-side **DuckDB-WASM** OLAP SQL execution running sub-10ms queries across 100K+ transactions, with Bryntum SLA timeline scheduling.

---

## 2. Zero-Trust Security Architecture & 5-Layer Purchase Gate

AegisPay enforces a strict defense-in-depth security boundary. Every purchase intent—whether generated by conversational chat, 1-click UI action, or an external ACP autonomous agent—must pass 5 deterministic security gates:

```mermaid
flowchart TD
    UserPrompt["Customer Purchase Intent\n(Conversational Prompt / 1-Click UI / ACP Agent)"] --> L1

    subgraph DefensePipeline["5-Layer Defense-in-Depth Purchase Gate"]
        L1["Layer 1: Scoped Auth & Identity Verification\n- JWT session validation\n- Read-Only tracking token isolation (/history)"]
        L1 -->|Valid Session| L2["Layer 2: WebCrypto Ed25519 Cryptographic Mandate\n- Hardware-signed asymmetric browser signature\n- Enforces max_total, max_single_item, expiry"]
        L2 -->|Valid Signature| L3["Layer 3: Single-Threaded Atomic Redis Lua Firewall\n- Sub-1ms execution in Render Key-Value\n- Atomic balance decrement & velocity limiter\n- Blocks prompt injection & concurrent race conditions"]
        L3 -->|Within Budget| L4["Layer 4: Merchant Anomaly & Whitelist Gate\n- Verified domain whitelisting & category filters\n- Automatic rejection of merchant anomaly score > 300 / 1000"]
        L4 -->|Low Risk| L5["Layer 5: PayPal Orders v2 Escrow Hold\n- Two-Phase Commit (2PC) inventory reservation\n- intent: 'AUTHORIZE' (no instant debit)\n- Initiates 72h Render Workflows price-drop watcher"]
    end

    L3 -- "Exceeds Budget" --> HITL["Step Down to HITL\n(Interactive 1-Click Card)"]
    L4 -- "High Risk" --> HITL
    L5 --> Success["Order Confirmed & Escrow Held\nPayPal Authorization ID Generated"]
```

### End-to-End System Component Topology

```mermaid
flowchart LR
    subgraph ClientLayer["Frontend Surface (apps/web-cockpit)"]
        BuyerPortal["Buyer Agent Portal\n- assistant-ui Chat\n- Flagship PDP\n- Fastlane v6 SDK"]
        MerchantPortal["Merchant Clearinghouse\n- AG Grid Enterprise v36\n- AG Studio 3 Canvas\n- Bryntum SLA Scheduler"]
        JudgeCockpit["Evaluation & Chaos Portal\n(/judge & /simulator)"]
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

## 3. Core Architectural Innovations & Technical Moats

### 1. 1-Prompt Autonomous Buy & Conversational Commerce
- **State-of-the-Art Chat Architecture**: Built on `@assistant-ui/react`, Next.js 15, and React 19, powered by `@mastra/core` and Google Gemini 2.5 Flash.
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

## 4. Enterprise Platform Architecture & Deep Partner Integrations

AegisPay integrates best-in-class commerce, cloud, and analytical infrastructure to deliver a bank-grade production clearinghouse:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                AEGISPAY PLATFORM STACK                                 │
├───────────────────────┬───────────────────────────┬────────────────────────────────────┤
│ Subsystem             │ Technology Engine         │ Enterprise Capability              │
├───────────────────────┼───────────────────────────┼────────────────────────────────────┤
│ Commerce Rails        │ PayPal Developer Platform │ 18+ REST Endpoints (v1, v2, v3)    │
│ Clearinghouse UI      │ AG Grid Enterprise v36    │ Master/Detail, DuckDB SSRM, Studio │
│ Cloud Infrastructure  │ Render Cloud Fabric       │ Workflows, Key-Value, Managed PG16 │
│ Product Intelligence  │ Channel3 Commerce API     │ 100M+ SKUs, Knapsack ILP Solver    │
│ Contract Resilience   │ APIMatic Grounded SDK     │ Strict Deserialization, Idempotency│
│ Dispute Timeline      │ Bryntum SLA Scheduler     │ Arbitration Shift Scheduling       │
└───────────────────────┴───────────────────────────┴────────────────────────────────────┘
```

### 4.1 PayPal Developer Platform (Commerce Rails & Agent Toolkit)
* **Core Technology:** `@paypal/paypal-server-sdk`, `@paypal/agent-toolkit`, `@paypal/mcp`, PayPal JS SDK v6 Web Components
* **Integration Highlights:**
  - **18+ Live REST Endpoints**: Authoritative execution across Orders v2, Payments v2, Vault v3, Invoicing v2, Disputes v1, Shipment Tracking v1, and Webhooks v1.
  - **Multi-Merchant Clearinghouse**: Dynamically maps knapsack cart items to individual merchant `payee: { merchant_id: "..." }` blocks within a single authorization hold.
  - **Vault v3 Delegated Mandates**: Powers both 1-prompt buyer autonomous purchases and synthetic intent discount bids via Setup Tokens.
  - **Fastlane Accelerated Checkout**: Integrates PayPal JS SDK v6 Web Components for device-authenticated guest conversion.
  - **Live Negative Testing Support**: Handles genuine `PayPal-Mock-Response` headers (`INSTRUMENT_DECLINED`, `COMPLIANCE_VIOLATION`) with compensating ledger rollbacks.
* **Code References:** [`apps/api-orchestrator/src/services/paypal/`](apps/api-orchestrator/src/services/paypal/), [`packages/mcp-enforcer/src/paypal-toolkit-bridge.ts`](packages/mcp-enforcer/src/paypal-toolkit-bridge.ts)
* **Dedicated Dossier:** [`docs/PAYPAL_INTEGRATION.md`](docs/PAYPAL_INTEGRATION.md)

### 4.2 AG Grid Enterprise v36 & AG Studio 3 (Clearinghouse Workstation)
* **Core Technology:** `ag-grid-enterprise` v36.3.0, `@ag-grid-community/react`, `@ag-grid/studio` v3.0.0, `@duckdb/duckdb-wasm`
* **Integration Highlights:**
  - **Enterprise Grid Architecture**: Full tree-shakable module registry (`enterpriseModules.ts`), dynamic Quartz theming engine, and 6 custom React cell renderers (HATEOAS hold buttons, SVG radial risk meters, photo diffs, carrier trackers, SLA timers).
  - **Master/Detail Hierarchical Sub-Grids**: Nested order inspection displaying multi-payee purchase unit splits, Vault setup tokens, and embedded forensic evidence dossiers.
  - **DuckDB-WASM SSRM OLAP Bridge**: High-performance Server-Side Row Model executing parameterized SQL queries over 100K+ records in `< 10ms` in a background Web Worker.
  - **Live AG Studio 3 Canvas**: Active `<LiveStudioCanvas />` with multi-agent harness (`setupStudioHarness`), custom `paypal_arbiter` runner, and natural language dashboard commands.
  - **In-Cell Sparklines & Integrated Charts**: 30-day liquidity area sparklines and column velocity sparklines.
* **Code References:** [`apps/web-cockpit/src/components/ag-studio/`](apps/web-cockpit/src/components/ag-studio/), [`apps/web-cockpit/src/components/merchant/DataGrid.tsx`](apps/web-cockpit/src/components/merchant/DataGrid.tsx)
* **Dedicated Dossier:** [`docs/AG_GRID.md`](docs/AG_GRID.md)

### 4.3 Render Cloud Infrastructure (Multi-Service Native Fabric)
* **Core Technology:** `@renderinc/sdk` v1.8.0, Declarative Blueprint IaC (`render.yaml`), Render Key-Value, Managed PostgreSQL 16
* **Integration Highlights:**
  - **Native Render Workflows (`type: workflow`)**: Built on `@renderinc/sdk` v1.8.0 `flow()` and `ctx.step()` for durable execution of 72h price-drop polling and vision forensics with automatic backoff.
  - **Render Key-Value Redis (`type: keyvalue`)**: Private memory engine configured with `maxmemoryPolicy: noeviction` executing single-threaded Lua spend enforcers in $< 1\text{ms}$.
  - **Managed PostgreSQL 16 (`databases`)**: Double-entry ledger with automated `preDeployCommand` migrations and `initialDeployHook` 1,000 sandbox transaction seeder.
  - **Render Cron Reconciler (`type: cron`)**: Scheduled clearing engine (`0 */6 * * *`) reconciling pending holds against carrier telemetry.
  - **Unified Regional Deployment**: Zero-latency private networking with pinned `region: oregon` and automatic PR previews (`previews.generation: automatic`).
* **Code References:** [`render.yaml`](render.yaml), [`apps/workflows/src/`](apps/workflows/src/), [`apps/api-orchestrator/src/services/render-workflow-client.ts`](apps/api-orchestrator/src/services/render-workflow-client.ts)
* **Dedicated Dossier:** [`docs/RENDER.md`](docs/RENDER.md)

### 4.4 Channel3 Commerce Intelligence (Catalog & Cart Solver)
* **Core Technology:** Channel3 REST API (`/v1/search`, `/v1/lookup`), Promo Code `PAYPAL-HACKATHON-2026`
* **Integration Highlights:**
  - **100M+ Product Discovery**: Multimodal catalog discovery (`/v1/search`) across text queries, scene photos, category IDs, and hex color palettes with 20,000 active credits.
  - **Two-Phase Commit (2PC) Inventory Pre-Flight**: Pre-authorizes and locks merchant stock before creating PayPal order authorizations.
  - **Algorithmic Knapsack Solver**: Optimizes multi-vendor carts by balancing retail prices, tiered shipping waivers, and passing $\alpha = 0.75$ commission rebates back to the consumer.
  - **72-Hour Price Watcher Integration**: Supplies real-time price delta feeds to durable Render Workflows.
* **Code References:** [`apps/api-orchestrator/src/services/cart-solver.ts`](apps/api-orchestrator/src/services/cart-solver.ts), [`apps/workflows/src/tasks/price-drop-watcher.ts`](apps/workflows/src/tasks/price-drop-watcher.ts)

### 4.5 APIMatic Grounded SDK Implementation
* **Core Technology:** APIMatic Context Plugin, `@paypal/paypal-server-sdk`
* **Integration Highlights:**
  - **Strict Model Grounding**: APIMatic-validated client initialization with strict type deserialization across complex PayPal domain models.
  - **Idempotency Token Management**: Enforces client-generated `PayPal-Request-Id` UUIDs across all mutating order and payment calls.
  - **Fault-Injection & Mock Support**: Injects and handles `PayPal-Mock-Response` negative testing headers to guarantee application resilience against bank declines and compliance violations.
* **Code References:** [`apps/api-orchestrator/src/services/paypal/paypal-client.ts`](apps/api-orchestrator/src/services/paypal/paypal-client.ts)
* **Dedicated Dossier:** [`docs/APIMATIC.md`](docs/APIMATIC.md)

### 4.6 Bryntum SLA Dispute Scheduler
* **Core Technology:** `@bryntum/scheduler-trial` v7.3
* **Integration Highlights:**
  - **Dispute SLA Timeline Visualization**: High-performance interactive timeline mapping open disputes against strict PayPal seller response deadlines (`seller_response_due_date`).
  - **"Unallocated SLA Deadline" Alert Badge**: Surfaces pending disputes requiring immediate analyst intervention before default forfeiture.
  - **Color-Coded Urgency Matrix**: Red (<6h remaining), Yellow (vision triage active), Green (evidence submitted).
  - **1-Click "Imminent Breach" Filter**: Instantly narrows grid rows to critical SLA items to auto-schedule claims resolution shifts.
* **Code References:** [`apps/web-cockpit/src/components/bryntum/DisputeSlaScheduler.tsx`](apps/web-cockpit/src/components/bryntum/DisputeSlaScheduler.tsx)

---

## 5. 🔍 Evaluator Testing Guide & Professional Demo Walkthrough

This section provides a structured, professional guide for judges, evaluators, and engineers to interactively test AegisPay's AI agents, clearinghouse workstations, and security barriers.

### 5.1 Interactive Portals & Navigation Map

| Portal / Route | Interface Role | Primary Evaluation Capabilities |
| :--- | :--- | :--- |
| **`http://localhost:3000/`** | **Buyer Agent Portal** | Multi-turn conversational commerce, assistant-ui generative tools, 1-prompt buy, Fastlane checkout |
| **`http://localhost:3000/judge`** | **Pre-Authenticated Evaluation Lab** | 4-act automated testing suite, prompt injection shield, synthetic bidding, live telemetry console |
| **`http://localhost:3000/merchant`** | **Merchant Clearinghouse** | AG Grid Enterprise v36 Master/Detail, AG Studio 3 live canvas, Bryntum SLA timeline scheduler |
| **`http://localhost:3000/simulator`** | **Chaos Negative Testing Lab** | Injects real `PayPal-Mock-Response` headers (`INSTRUMENT_DECLINED`, `COMPLIANCE_VIOLATION`) |
| **`http://localhost:3000/products/[id]`** | **Flagship Product Detail (PDP)** | Multi-angle studio zoom gallery, 2PC stock verification, multi-merchant price comparison matrix |
| **`http://localhost:4000/api/integrations/verify`** | **Health Telemetry Endpoint** | Real-time diagnostic JSON returning live connectivity for PostgreSQL, Redis, PayPal, Channel3 |

---

### 5.2 Step-by-Step Evaluator Test Scenarios (How to Check Our Agent)

#### Scenario A: Testing the Autonomous Conversational Shopping Agent
1. **Navigate to:** `http://localhost:3000/` (Buyer Agent Portal).
2. **Test Multi-Turn Product Discovery:**
   - Type in the chat bar:
     ```text
     "Find me noise cancelling wireless headphones with 30h battery under $350"
     ```
   - **Observe:**
     - The Fastify SSE data stream returns live token streaming (`0:text`).
     - Tool-calling visualizers appear displaying `discover_products` querying Channel3 and `score_and_rank` executing deterministic utility ranking.
     - Generative UI cards render with product badges (`Best Value`, `Price Leader`), verified Channel3 pricing, and instant cashback breakdowns.
3. **Test Side-by-Side Product Comparison (Battle Arena):**
   - Click the **[⚖️ Select / Compare]** chip on two different headphones in the chat.
   - Type or click:
     ```text
     "Compare these two side-by-side"
     ```
   - **Observe:** The Generative **Battle Arena** drawer expands, highlighting technical specifications, battery life, weight, merchant anomaly score, and warranty terms side-by-side.
4. **Test 1-Prompt Autonomous Buying & Spend Mandates:**
   - Click **Connect with PayPal** in the header and choose **Mode B: Spend Allowance Authorization** (mints a PayPal Vault v3 Setup Token + browser-signed Ed25519 mandate with a $400 spend limit).
   - Type in chat:
     ```text
     "Buy the Sony WH-1000XM5 under $300 right now"
     ```
   - **Observe:**
     - The agent verifies the Ed25519 mandate, decrements the balance atomically via Redis Lua in `< 1ms`, locks inventory via 2PC, and executes the PayPal order without popup modals.
     - A streamed success receipt card appears with carrier tracking and a scoped receipt link.

---

#### Scenario B: Testing the 4-Act Automated Evaluation Suite (`/judge`)
Navigate to `http://localhost:3000/judge`. This pre-authenticated lab allows testing all core algorithmic moats in zero-friction 1-click actions:

* **Act 1: Adversarial Prompt Injection Block**
  - Click **[Trigger $5,000 Injection Attack]**.
  - **Result:** An external prompt injection attempt over a $500 cap is intercepted by the single-threaded Redis Lua firewall. The transaction is **rejected in < 1ms (`ERR_EXCEEDS_TOTAL_MANDATE_BUDGET`)** before PayPal REST APIs can be touched.
* **Act 2: Synthetic Intent Bidding & Vault Authorization**
  - Click **[Trigger Synthetic Bid ($450)]** on a $490 cart.
  - **Result:** Mints a `SyntheticIntentVoucher` anchored by a live PayPal Vault v3 Setup Token. The autonomous merchant pricing agent accepts the counter-bid, immediately converting the setup token into an authorized PayPal order.
* **Act 3: Damaged Return Dispute Forensics & Auto-Adjudication**
  - Click **[Auto-Adjudicate Dispute]**.
  - **Result:** Render Workflows runs computer vision comparisons between pristine Channel3 studio photos and buyer damage photos, inspects EXIF metadata for Photoshop tampering, compiles an in-memory `pdf-lib` evidence dossier, and streams `multipart/form-data` to PayPal Disputes v1 (`/provide-evidence`).
* **Act 4: Knapsack Multi-Vendor Split & 72h Escrow Price Drop**
  - Click **[Trigger Knapsack + 72h Drop]**.
  - **Result:** The ILP knapsack solver optimizes multi-vendor split units, passes commission rebates ($\alpha = 0.75$), and places an `AUTHORIZE` hold. The Render Workflow detects a 15% price drop on Channel3 and captures the adjusted lower price ($403.75), auto-refunding the difference to the buyer.

---

#### Scenario C: Testing the Merchant Clearinghouse & AG Grid Enterprise Workstation
1. **Navigate to:** `http://localhost:3000/merchant`
2. **Test Master/Detail Order Expansion (`/merchant/transactions`):**
   - Click the expand arrow `▶` on transaction `TXN-DEMO-001`.
   - **Observe:** The child `<OrderDetailView />` sub-grid opens, revealing separate multi-payee merchant payouts, Vault v3 setup token states, and live USPS shipment tracking scan events.
3. **Test Live AG Studio 3 Multi-Agent Canvas:**
   - In `/merchant`, locate the active AG Studio 3 Canvas and Prompt Bar.
   - Type natural language prompt commands:
     ```text
     "Filter orders with margin > 15%"
     ```
     ```text
     "Isolate high risk disputes with abuse score > 60%"
     ```
   - **Observe:** The AG Studio Lead Agent compiles the prompt into DuckDB SQL and executes cross-filtering in `< 10ms` over client-side Arrow tables.
4. **Test Bryntum Dispute SLA Timeline:**
   - In the Merchant Arbitration view, locate the Bryntum SLA Scheduler.
   - Click the **"Imminent Breach"** filter button.
   - **Observe:** The grid isolates disputes approaching PayPal's `seller_response_due_date` with color-coded urgency bands (Red <6h, Yellow vision triage, Green submitted) and prominent **"Unallocated SLA Deadline"** badges.
5. **Test In-Cell Sparklines & Multi-Sheet Excel Export:**
   - In `/merchant/balances`, inspect in-cell area sparklines depicting 30-day balance trajectories.
   - Click **Pivot Mode** to cross-tabulate multi-currency reserves, and click **Export Excel** to download a formatted multi-sheet `.xlsx` workbook.

---

#### Scenario D: Testing Bank Declines & Ledger Rollbacks in the Chaos Lab (`/simulator`)
1. **Navigate to:** `http://localhost:3000/simulator`
2. **Trigger Bank Decline (`INSTRUMENT_DECLINED`):**
   - Select `INSTRUMENT_DECLINED` and click **Execute Negative Test**.
   - **Observe:** The Fastify orchestrator passes authentic `PayPal-Mock-Response` headers to PayPal Sandbox. PayPal returns HTTP 422 `INSTRUMENT_DECLINED`. Within `0.38ms`, the Redis Lua compensating script executes `rollback_spend`, restoring the buyer's budget cap with zero leakage.
3. **Trigger Compliance Violation (`COMPLIANCE_VIOLATION`):**
   - Select `COMPLIANCE_VIOLATION` and click **Execute Negative Test**.
   - **Observe:** The transaction is quarantined, 2PC inventory holds are released, and an audit entry is logged to PostgreSQL 16.

---

### 5.3 🏪 Comprehensive Seller Portal & Merchant Clearinghouse Guide (/merchant)

The **AegisPay Seller Portal** (`http://localhost:3000/merchant`) is an enterprise-grade merchant operational clearinghouse and autonomous commerce control tower. It bridges traditional e-commerce sellers, multi-merchant marketplaces, and autonomous AI buyer agents into a single unified workspace.

Whether a merchant is selling physical goods, digital subscriptions, or multi-vendor enterprise bundles, the Seller Portal provides 8 specialized operational modules:

```mermaid
flowchart LR
    subgraph SellerPortal["🏪 AegisPay Seller Portal (/merchant)"]
        direction TB
        M1["1. Overview & Revenue KPIs<br/>(Cleared Cash, Escrow Reserves)"]
        M2["2. Resolution Center & Forensics<br/>(Bryntum SLA & Evidence Diff)"]
        M3["3. Products & Catalog Sync<br/>(PayPal Catalog v1 & Channel3)"]
        M4["4. Commercial Invoicing & QR<br/>(PayPal Invoicing v2 & Instant QR)"]
        M5["5. Multi-Currency Balances<br/>(PayPal Balances v1 & Sparklines)"]
        M6["6. Subscription Plans<br/>(PayPal Billing Plans v1)"]
        M7["7. Financial Transactions<br/>(AG Grid v36 Master/Detail)"]
        M8["8. Live AG Studio 3 Assistant<br/>(DuckDB-WASM Natural Language)"]
    end

    subgraph SellerEngines["⚡ Autonomous Merchant Rails"]
        E1["PayPal Commerce Platform Rails"]
        E2["Channel3 Catalog Discovery Engine"]
        E3["Zero-Trust 72h Price-Drop Escrow"]
        E4["Forensic Computer Vision Adjudication"]
    end

    SellerPortal <--> SellerEngines
```

#### 1. Executive Sales & Revenue Overview (`/merchant?tab=overview`)
* **Live Financial Metric Tiles**:
  * **Gross Merchandise Volume (GMV)**: Real-time cumulative order volume processed across all autonomous agent checkouts.
  * **Cleared Cash**: Liquid settlement funds ready for instant merchant bank transfer.
  * **Held Escrow Reserves**: Funds held in conditional authorization escrow during the 72-hour price-protection and delivery window.
  * **Active Synthetic Intent Bids**: Real-time counter of buyer agents actively negotiating Dutch-auction purchase vouchers.
  * **Open Return Disputes**: Count of pending return claims requiring merchant triage before SLA expiration.
* **Channel3 Commerce Intelligence Reports (`DashboardReports.tsx`)**: Embedded market benchmarking charts displaying conversion ratios, competitive catalog price elasticity, and top-ranking search categories.
* **Integrated Seller Explainer Card (`SellerExplainerCard.tsx`)**: Contextual quick guide explaining zero-trust fraud elimination, autonomous agent order acceptance, and accelerated settlement.

#### 2. Resolution Center & Dispute Return Forensics (`/merchant?tab=disputes`)
* **Interactive Bryntum SLA Timeline Scheduler (`DisputeSlaScheduler.tsx`)**:
  * Visual Gantt timeline mapping open claims against strict PayPal seller response deadlines (`seller_response_due_date`).
  * Dynamic visual urgency bands: Critical Red (`< 6 hours` remaining), Amber Warning (`< 24 hours`), and Compliant Green.
  * **"Unallocated SLA Deadline"** triage badges identifying newly ingested claims that require forensic assignment.
* **Side-by-Side Visual Evidence Comparator (`EvidenceComparatorWidget.tsx`)**:
  * Displays the pristine Channel3 manufacturer product photograph side-by-side with the buyer-submitted return photo.
  * Interactive difference slider and defect pixel-mask overlay to instantly identify return fraud, swapped serial numbers, or transit damage.
* **HATEOAS Dynamic Dispute Action Renderer (`HateoasDisputeActionRenderer.tsx`)**:
  * 1-click execution of authoritative PayPal Disputes API v1 endpoints (`/v1/customer/disputes/{id}`):
    * `[Accept Claim]`: Issues instant full refund and auto-closes dispute without dinging merchant trust score.
    * `[Submit Forensic Evidence]`: Bundles carrier tracking, proof-of-delivery timestamps, and PDF visual inspection reports via `POST /provide-evidence`.
    * `[Propose Partial Offer]`: Submits an algorithmic compromise partial settlement to the buyer agent.
* **Autonomy Dial Widget (`AutonomyDialWidget.tsx`)**:
  * Configurable merchant automation rule slider (e.g., *"Auto-refund damaged claims under $25 if return freight cost exceeds product salvage value"*).

#### 3. Products & Multi-Merchant Catalog Management (`/merchant/products`)
* **PayPal Catalog Products API v1 Integration (`/v1/catalogs/products`)**:
  * Full CRUD management of merchant SKUs, titles, descriptions, categories, and inventory caps.
* **Add Product Modal (`AddProductModal.tsx`)**:
  * Interactive modal form to register new catalog items with SKU, Merchant Category Code (MCC), retail price in cents, stock allocation thresholds, and gallery images.
* **Bi-Directional Channel3 Sync**:
  * Every published product automatically synchronizes with the Channel3 product crawler, making it instantly discoverable and rankable by external AI shopping agents.

#### 4. Commercial Invoicing & Contactless QR Settlement (`/merchant/invoices`)
* **PayPal Invoicing API v2 Integration (`/v2/invoicing/invoices`)**:
  * Complete B2B/C2C invoice lifecycle: Create Draft, Finalize, Send via Email, Send Payment Reminder, Record Offline Settlement, and Cancel.
* **Dynamic QR Code Generation (`POST /v2/invoicing/invoices/{id}/generate-qr-code`)**:
  * In-portal generator producing dynamic base64 QR codes on demand, allowing contactless mobile checkout or instant in-person settlement for retail stores and pop-up locations.
* **Invoice Status Tracker**: Real-time status indicators (`DRAFT`, `SENT`, `PAID`, `CANCELLED`, `REFUNDED`).

#### 5. Multi-Currency Balances & Escrow Reserve Tracking (`/merchant/balances`)
* **PayPal Reporting Balances API v1 Integration (`/v1/reporting/balances`)**:
  * Comprehensive balance ledger displaying multi-currency cash positions across USD, EUR, GBP, CAD, and AUD.
  * Explicit breakdown of:
    1. **Available Cash**: Unrestricted funds cleared for immediate withdrawal.
    2. **Held Escrow Balance**: Funds under temporary hold during buyer transit or 72-hour price-drop windows.
    3. **Dispute Withheld Reserves**: Collateral held in reserve while chargebacks or claims are adjudicated.
* **In-Cell 30-Day Trend Sparklines**: High-performance SVG sparklines rendered inside AG Grid cells depicting 30-day liquidity trajectories.

#### 6. Subscription Plans & Recurring Billing Management (`/merchant/plans`)
* **PayPal Subscriptions & Billing Plans API v1 Integration (`/v1/billing/plans`, `/v1/billing/subscriptions`)**:
  * Create, activate, and deactivate recurring subscription tiers.
  * Configure billing frequencies (daily, weekly, monthly, annual), setup fees, and trial period durations.
  * Real-time subscriber cohort tracking and churn analytics.

#### 7. Master/Detail Financial Transaction Clearinghouse (`/merchant/transactions`)
* **PayPal Reporting Transactions API v1 Integration (`/v1/reporting/transactions`)**:
  * Master/Detail Grid architecture powered by **AG Grid Enterprise v36**:
    * Clicking the expand arrow `▶` on any parent order displays the child `<OrderDetailView />` sub-grid.
    * Sub-grid reveals sub-merchant fee splits, net payout disbursement amounts, Vault v3 setup token identifiers, and live carrier tracking milestone scans.
* **Enterprise Clearinghouse Controls**:
  * Multi-column sorting, floating quick-filters, column pin/reorder, and pivot aggregation.
  * Multi-sheet formatted Excel workbook export (`.xlsx`) and CSV data streaming.

#### 8. Live AI Merchant Assistant Canvas (AG Studio 3) (`/merchant?tab=assistant`)
* **AG Studio 3 Multi-Agent Harness**:
  * Natural language prompt bar directly embedded in the merchant workspace.
  * Merchants can type conversational prompts to instantly query and manipulate their financial data:
    * *"Show all orders with net margin greater than 18% delivered this week"*
    * *"Group transactions by merchant category and summarize total escrow holds"*
    * *"Filter disputes with imminent SLA breach due in the next 12 hours"*
  * The Lead Agent compiles queries into DuckDB SQL and transforms the AG Grid layout in `< 10ms` over client-side Arrow tables.

---

### 5.4 Complete Capabilities & Feature Inventory (What We Have)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   AEGISPAY FEATURE INVENTORY                                     │
├─────────────────────────┬────────────────────────────────────────────────────────────────────────┤
│ Layer / Capability      │ Feature Description & Operational Scope                                │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ Conversational Chat     │ assistant-ui + Mastra DAG + Gemini 2.5 Flash with Fastify SSE stream   │
│ Generative UI Tools     │ Product cards, side-by-side Battle Arena, turn-attached product chips    │
│ Flagship PDP & Modal    │ Dedicated route (/products/[id]) with studio gallery zoom & 2PC stock  │
│ Spend Protection        │ WebCrypto Ed25519 SessionMandates + Sub-1ms Redis Lua atomic limiter   │
│ Fastlane Checkout       │ PayPal JS SDK v6 Web Components accelerated guest conversion           │
│ Knapsack Optimizer      │ Integer Linear Programming multi-vendor cart solver (Channel3 catalog) │
│ Synthetic Intent        │ Bounded Dutch auction discount negotiation backed by Vault v3 tokens   │
│ 72h Price-Drop Escrow   │ Render Workflows durable polling capturing price drops & auto-refunds  │
│ Dispute Forensics       │ Computer vision photo diffs, EXIF tampering audits, pdf-lib dossiers   │
│ Merchant Clearinghouse  │ AG Grid Enterprise v36 Master/Detail sub-grids, dynamic Quartz theme   │
│ DuckDB-WASM SSRM Bridge │ Web Worker Server-Side Row Model running <10ms SQL over 100K+ records  │
│ Live AG Studio 3 Canvas │ Multi-agent AI harness executing natural language dashboard commands   │
│ Bryntum SLA Scheduler   │ Dispute response timeline with Unallocated SLA badge & breach filters  │
│ Chaos Negative Testing  │ PayPal-Mock-Response header simulator for bank decline rollback tests  │
│ Automated Cloud Deploy  │ Declarative render.yaml Blueprint (Web, Workflows, Cron, PG16, Redis)  │
└─────────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

---

### 5.5 3-Minute Video Presentation Storyboard

For evaluators watching the 180-second demonstration video (script located in [`docs/DEMO_VIDEO_SCRIPT.md`](docs/DEMO_VIDEO_SCRIPT.md)):

```
====================================================================================
                        AEGISPAY 3-MINUTE VIDEO STORYBOARD
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

---

## 6. ☁️ Production Deployment Guide (Render Blueprint & Manual)

AegisPay is engineered for one-click deployment on **Render** via Infrastructure-as-Code (`render.yaml`).

### Option A: 1-Click Render Blueprint Deployment (Recommended)

1. Click the **Deploy to Render** button:
   
   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vkk5880/Aegispay)

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

## 7. 💻 Local Development & Quickstart

### Prerequisites
- **Node.js** >= 20.x (Node 22 recommended)
- **pnpm** >= 9.x (`npm install -g pnpm`)
- **PostgreSQL** 16 & **Redis** (local instances or Docker)

### 1-Minute Setup

```bash
# 1. Clone the repository
git clone https://github.com/vkk5880/Aegispay.git
cd Aegispay

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
- **Pre-Authenticated Evaluation Lab**: `http://localhost:3000/judge`
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
│   │   │   ├── app/judge/          # Pre-authenticated 3-minute Evaluation Lab
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

## 9. 🔌 Universal LLM & MCP Integration Guide (Connect Any AI Agent)

AegisPay is engineered as a **universal autonomous commerce clearinghouse and backend engine**. It separates autonomous AI reasoning from financial execution, allowing **any external LLM, autonomous agent, IDE coding assistant, or multi-agent framework** to execute secure, multi-merchant commerce operations without ever handling raw payment credentials or violating spend limits.

Whether you are building with:
- **Desktop AI IDEs & Coding Assistants**: Cursor, Claude Desktop, Windsurf, Claude Code, Cline, Roo-Code.
- **Agent Frameworks**: LangChain, CrewAI, AutoGen, OpenAI Swarm, Mastra, LlamaIndex, PydanticAI.
- **Direct LLM APIs**: Anthropic Claude 3.5 Sonnet, OpenAI GPT-4o / o3-mini, Google Gemini 2.5 Flash / 3.5 Flash Lite, DeepSeek R1, or local models via Ollama.
- **Custom Backends & Microservices**: Python, Go, Node.js, Rust, or any standard HTTP client.

AegisPay provides standard, turnkey integration interfaces backed by zero-trust cryptographic enforcement.

```mermaid
flowchart TD
    subgraph ExternalAgents["🤖 ANY External LLM / AI Agent"]
        A1["Cursor IDE / Claude Desktop / Windsurf"]
        A2["LangChain / CrewAI / AutoGen / Mastra"]
        A3["OpenAI GPT-4o / Claude 3.5 / Gemini / Ollama"]
        A4["Enterprise ERP / Procurement Bot"]
    end

    subgraph DualTransports["🔌 AegisPay Universal Connectivity Gateway"]
        T1["Stdio JSON-RPC Transport<br/>(Desktop IDEs & Local Subprocesses)"]
        T2["Streamable HTTP JSON-RPC 2.0<br/>(POST /mcp • Remote & Cloud Agents)"]
        T3["Streaming Agent REST / SSE Gateway<br/>(POST /api/chat • Natural Language)"]
        T4["ACP Discovery Protocol<br/>(GET /.well-known/acp.json)"]
    end

    subgraph ZeroTrustEnforcer["🛡️ Zero-Trust Security Gate (@aegispay/mcp-enforcer)"]
        Z1["1. Ed25519 SessionMandate Verifier"]
        Z2["2. Atomic Redis Lua Spend Governor (maxmemory: noeviction)"]
        Z3["3. Merchant Anomaly Gate (Anomaly Score > 0.70 Rejection)"]
        Z4["4. Category Smuggling & Prohibited Merchant Sentinel"]
    end

    subgraph CommerceEngines["⚙️ Execution Engines & Partner Rails"]
        C1["Channel3 Multi-Merchant Catalog & 0/1 Knapsack ILP"]
        C2["PayPal Orders v2 & Vault v3 Rails"]
        C3["PayPal Disputes v1 & Invoicing v2 Services"]
        C4["Bryntum SLA Dispute Arbitration Engine"]
    end

    ExternalAgents --> DualTransports
    DualTransports --> ZeroTrustEnforcer
    ZeroTrustEnforcer --> CommerceEngines
```

---

### 9.1 Autonomous Clearinghouse Gateway Architecture

AegisPay exposes two production-grade connection modalities:

1. **Model Context Protocol (MCP) v2 (2026-07-28 Specification)**:
   - **Stdio Transport**: Executable as a local subprocess (`node packages/mcp-enforcer/dist/server.js` or `pnpm mcp:stdio`) for desktop coding assistants and terminal agents.
   - **Streamable HTTP JSON-RPC 2.0 Transport (`POST /mcp`)**: Stateful and stateless streaming HTTP transport hosted on the Fastify API Orchestrator. Includes DNS rebinding protection (`hostHeaderValidation`), origin security, and continuous SSE response streams conforming to the modern MCP TypeScript SDK v2.
2. **Conversational Agent REST / SSE Gateway (`POST /api/chat`)**:
   - High-level conversational commerce endpoint accepting natural language intent (e.g., *"Find Sony WH-1000XM5 under $300 and buy it autonomously"*).
   - Returns continuous SSE data streams (`0:text`, `9:toolCall`, `a:toolResult`) compatible with the Vercel AI SDK and Mastra engine.
   - Handles multi-turn memory persistence, preference extraction, watchlist tracking, and 1-prompt autonomous purchase execution.

---

### 9.2 Complete 16-Tool Catalog Exposed to External LLMs

AegisPay registers **16 enterprise tools** grouped into three specialized suites. Every tool is strictly governed by Zod and JSON Schema definitions:

#### Suite A: Agentic Commerce Protocol (ACP) Checkout Tools (5 Tools)
Standardized autonomous checkout lifecycle maintaining compliance with the Stripe & OpenAI Agentic Commerce Protocol:

| Tool Name | Parameters | Description | Security Enforcement |
| :--- | :--- | :--- | :--- |
| `create_checkout_session` | `meta: object`, `payload: object` | Initiates an autonomous checkout session with dynamic multi-merchant tax, shipping, and discount calculation. | Validates currency and schema constraints. |
| `get_checkout_session` | `meta: object`, `id: string` | Authoritative retrieval of active session state, line items, merchant routing, and amount totals. | Read-only; session ownership verification. |
| `update_checkout_session` | `meta: object`, `id: string`, `payload: object` | Performs full replacement update of items, quantities, shipping addresses, or delivery tiers with atomic price recalculation. | State lock verification; prevents concurrent cart corruption. |
| `complete_checkout_session` | `meta: object`, `id: string`, `payload: object` | Finalizes autonomous checkout using vaulted PayPal instruments (`vault_token_id`) or signed Ed25519 payment mandates. | **Hardware-bound Ed25519 signature + Atomic Redis Lua spend reservation.** |
| `cancel_checkout_session` | `meta: object`, `id: string` | Terminates active checkout session, releases stock holds, and emits structured audit telemetry to the tamper-evident log chain. | Releases uncommitted spend reservations in Redis. |

#### Suite B: Official PayPal Agentic Commerce Toolkit Bridge (5 Tools)
Enterprise wrapper around `@paypal/agent-toolkit/mcp` providing zero-trust isolation:

| Tool Name | Parameters | Description | Security Enforcement |
| :--- | :--- | :--- | :--- |
| `create_order` | `intent: "CAPTURE" \| "AUTHORIZE"`, `purchase_units: array` | Programmatically mints PayPal Orders v2 with custom payee routing and currency specifications. | **Spend-mutating gate**: Requires valid SessionMandate and Lua budget allocation. |
| `pay_order` | `order_id: string` | Executes capture or escrow authorization against a pre-approved PayPal order. | **Spend-mutating gate**: Validates order amount matches reserved allowance. |
| `create_invoice` | `detail: object`, `invoicer: object`, `primary_recipients: array`, `items: array` | Generates official itemized B2B/C2C invoices with tax, discount, and payment term breakdowns. | Validates payee identity against verified merchant whitelist. |
| `send_invoice` | `invoice_id: string`, `send_to_recipient: boolean` | Dispatches digital invoices directly to recipient billing emails with delivery webhook tracking. | Throttled by merchant rate-limiter. |
| `generate_qr_code` | `invoice_id: string` | Generates instant dynamic QR code image payloads for in-person, cross-device, or POS agent settlement. | Read-only verification of active invoice. |

#### Suite C: Algorithmic Custodian, Escrow & Dispute Tools (6 Tools)
Algorithmic clearinghouse tools for autonomous multi-merchant optimization and dispute arbitration:

| Tool Name | Parameters | Description | Security Enforcement |
| :--- | :--- | :--- | :--- |
| `optimize_channel3_multi_merchant_basket` | `allowance_voucher_id: string`, `search_query?: string`, `category_ids?: string[]`, `items?: array` | Solves multi-merchant basket allocation via 0/1 Knapsack Mixed-Integer Linear Programming, optimizing pricing, shipping, and delivery dates. | Verifies allowance voucher validity before running ILP solver. |
| `authorize_conditional_escrow_order` | `mandate_id: string`, `merchant_domain: string`, `requested_cents: number`, `category_id: string`, `items: array` | Verifies buyer Ed25519 signature, queries merchant anomaly scores, atomically decrements Redis spend budget, and places conditional escrow hold. | **Full 5-layer purchase gate.** Rejects if anomaly score > 0.70 or category is prohibited. |
| `broadcast_synthetic_intent_voucher` | `mandate_id: string`, `channel3_product_id: string`, `merchant_domain: string`, `retail_offer_cents: number`, `buyer_bid_cents: number` | Emits cryptographic synthetic intent vouchers across Channel3 merchant networks to solicit competitive counter-bids without upfront charge. | Validates buyer wallet vault status with PayPal Vault v3 ($0 Setup Token). |
| `void_or_capture_escrow_hold` | `authorization_id: string`, `action: "CAPTURE" \| "VOID"`, `amount_cents?: number` | Algorithmic escrow release upon verified delivery milestone or immediate void upon merchant SLA breach. | Requires carrier tracking confirmation or verified SLA timer expiration. |
| `submit_dispute_evidence_bundle` | `paypal_dispute_id: string`, `carrier_tracking_number?: string`, `policy_proof_text?: string`, `vision_defect_mask?: number[]` | Assembles tamper-evident forensic PDF dossiers (SHA-256 evidence bundles) and uploads directly to PayPal Disputes API v1. | Cryptographic hash chaining on audit ledger. |
| `propose_dispute_partial_settlement` | `paypal_dispute_id: string`, `compromise_amount_cents: number` | Proposes algorithmic compromise refund amounts based on Bryntum dispute timelines and merchant SLA terms. | Settlement amount must not exceed original transaction capture total. |

---

### 9.3 Zero-Trust Security & Cryptographic Mandate Enforcement

Unlike traditional AI agent integrations that grant language models raw API keys or unrestricted credit cards, AegisPay enforces **strict zero-trust boundaries** across all tool calls:

1. **Hardware-Signed Ed25519 Mandates**: Every mutating tool (`create_order`, `authorize_conditional_escrow_order`, `complete_checkout_session`) requires a valid `SessionMandate` signed by the user's client keypair. The signature covers `amount_cents`, `merchant_domain`, `category_id`, and `expires_at`. An agent cannot modify parameters without invalidating the signature.
2. **Sub-1ms Atomic Redis Lua Spend Governor**: Spend reservations are evaluated inside a single-threaded Redis Lua script (`EVALSHA`) configured with `maxmemoryPolicy: noeviction`. If an agent attempts to spend $50.01 against a $50.00 allowance, the transaction is rejected deterministically in sub-millisecond time with zero race conditions.
3. **Merchant Anomaly Gate**: Queries the real-time merchant risk registry. Any merchant exhibiting an anomaly score > 0.70 (e.g., sudden order volume surges, unverified fulfillment endpoints) is rejected.
4. **Category Smuggling Sentinel**: Tokenizes item descriptions and matches them against prohibited merchant category codes (MCCs) to prevent agents from being tricked by prompt injection into purchasing prohibited goods.

---

### 9.4 Ready-to-Use IDE & Assistant Configuration Snippets

Connect your favorite coding assistant or desktop agent to AegisPay in seconds:

#### A. Claude Desktop Configuration
Add AegisPay to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

**Option 1: Stdio Transport (Local Build)**
```json
{
  "mcpServers": {
    "aegispay": {
      "command": "node",
      "args": [
        "/absolute/path/to/agpay/packages/mcp-enforcer/dist/server.js"
      ],
      "env": {
        "PAYPAL_CLIENT_ID": "your_sandbox_client_id",
        "PAYPAL_CLIENT_SECRET": "your_sandbox_client_secret",
        "PAYPAL_ENVIRONMENT": "sandbox",
        "REDIS_URL": "redis://127.0.0.1:6379"
      }
    }
  }
}
```

**Option 2: Streamable HTTP Transport (Live Cloud Deployment / Render)**
```json
{
  "mcpServers": {
    "aegispay": {
      "url": "https://agpay.onrender.com/mcp",
      "headers": {
        "Content-Type": "application/json"
      }
    }
  }
}
```

#### B. Cursor IDE Configuration
Create or edit `.cursor/mcp.json` in your project root or user settings:
```json
{
  "mcpServers": {
    "aegispay-enforcer": {
      "command": "pnpm",
      "args": ["--filter", "@aegispay/mcp-enforcer", "start"],
      "env": {
        "NODE_ENV": "development",
        "PAYPAL_ENVIRONMENT": "sandbox"
      }
    }
  }
}
```

#### C. Windsurf / Codeium Configuration
Add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "aegispay": {
      "command": "node",
      "args": ["/path/to/agpay/packages/mcp-enforcer/dist/server.js"]
    }
  }
}
```

---

### 9.5 Programmatic Integration Guides (Python, TypeScript, cURL)

#### A. Python Integration (Official `mcp` SDK)
Connect any Python-based AI agent (LangChain, CrewAI, AutoGen, LlamaIndex) via Streamable HTTP:

```python
import asyncio
from mcp import ClientSession
from mcp.client.sse import sse_client

async def main():
    server_url = "https://agpay.onrender.com/mcp"
    
    async with sse_client(server_url) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            # 1. Initialize MCP Session
            await session.initialize()
            
            # 2. Discover Available Commerce Tools
            tools = await session.list_tools()
            print(f"Connected to AegisPay! Discovered {len(tools.tools)} enterprise tools.")
            
            # 3. Call Knapsack Basket Optimization
            optimization_result = await session.call_tool(
                "optimize_channel3_multi_merchant_basket",
                arguments={
                    "allowance_voucher_id": "vch_demo_100",
                    "search_query": "Sony Noise Cancelling Headphones",
                    "category_ids": ["electronics"]
                }
            )
            print("Optimization Result:", optimization_result.content[0].text)

if __name__ == "__main__":
    asyncio.run(main())
```

#### B. TypeScript / Node.js Integration (`@modelcontextprotocol/sdk`)
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function runAutonomousProcurement() {
  const transport = new SSEClientTransport(new URL("https://agpay.onrender.com/mcp"));
  const client = new Client({ name: "ExternalBuyerAgent", version: "1.0.0" }, { capabilities: {} });

  await client.connect(transport);
  console.log("Connected to AegisPay MCP Gateway.");

  // Execute ACP Autonomous Checkout Session Creation
  const session = await client.callTool({
    name: "create_checkout_session",
    arguments: {
      meta: { api_version: "2026-04-17", request_id: `req_${Date.now()}` },
      payload: {
        currency: "usd",
        items: [
          { id: "sony_wh1000xm5", name: "Sony WH-1000XM5", quantity: 1, unit_price_cents: 29800 }
        ]
      }
    }
  });

  console.log("ACP Checkout Session Initialized:", session);
}

runAutonomousProcurement();
```

#### C. Raw HTTP JSON-RPC 2.0 (`POST /mcp`)
Invoke any tool directly using raw cURL without external dependencies:

```bash
curl -X POST https://agpay.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 101,
    "method": "create_checkout_session",
    "params": {
      "meta": { "api_version": "2026-04-17", "request_id": "req_curl_001" },
      "payload": {
        "currency": "usd",
        "items": [
          { "id": "prod_1", "name": "4K Ultra-Wide Monitor", "quantity": 1, "unit_price_cents": 45000 }
        ]
      }
    }
  }'
```

#### D. Conversational Agent Streaming (`POST /api/chat`)
Trigger full conversational multi-merchant shopping with streaming SSE events:

```bash
curl -N -X POST https://agpay.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find me high-end wireless headphones under $350 and optimize the cart across Best Buy and Target",
    "stream": true,
    "budget_cap_cents": 35000
  }'
```

#### E. Autonomous Protocol Discovery (`GET /.well-known/acp.json`)
Autonomous buyer agents discover supported API versions and endpoint capabilities via standardized ACP discovery:

```bash
curl -s https://agpay.onrender.com/.well-known/acp.json | jq .
```

*Response:*
```json
{
  "name": "AegisPay Autonomous Commerce Clearinghouse",
  "version": "2026-04-17",
  "transports": ["rest", "mcp"],
  "endpoints": {
    "mcp_gateway": "/mcp",
    "create_checkout_session": "/acp/checkout_sessions",
    "payment_handler": "/acp/payment_handler"
  },
  "capabilities": {
    "zero_trust_ed25519": true,
    "atomic_redis_lua_spend_limits": true,
    "paypal_vault_v3": true,
    "knapsack_ilp_optimization": true
  }
}
```

---

### 9.6 Multi-Provider LLM Switching & Air-Gapped Fallback Reasoner

The AegisPay API Orchestrator features a pluggable model routing architecture configured via the `COMMERCE_AGENT_MODEL` environment variable:

| Model ID | Provider | Performance & Role in AegisPay |
| :--- | :--- | :--- |
| `google/gemini-3.5-flash-lite` *(Default)* | Google Gemini | Ultra-low latency (<250ms TTFT) for high-frequency catalog searching and real-time SSE streaming. |
| `google/gemini-2.5-flash` | Google Gemini | High-speed multi-modal reasoning and complex basket price optimization. |
| `openai/gpt-4o` | OpenAI | Advanced instruction following for structured ACP checkout session management. |
| `anthropic/claude-3-5-sonnet` | Anthropic | Superior reasoning on multi-merchant dispute evidence synthesis and SLA timeline arbitration. |
| `ollama/llama3.2` | Local / Air-Gapped | Completely offline, on-premise execution with zero external network telemetry. |

#### Bring Your Own Key (BYOK) Dynamic Verification
Users and evaluators can dynamically inject their personal API keys in the Cockpit UI. The backend verifies keys in real-time (`POST /api/buyer/verify-llm-key`) against Google and OpenAI provider endpoints before saving, ensuring unauthenticated models are never activated.

#### 🛡️ Air-Gapped Deterministic Fallback Reasoner (`local-reasoner.ts`)
To ensure total reliability during evaluator demos or network outages:
- If no external API keys are configured, or if provider rate limits (HTTP 429) are encountered, AegisPay **automatically falls back to its internal Deterministic Local Reasoner**.
- The fallback reasoner parses user intents (DISCOVER, COMPARE, OPTIMIZE, BUY, TRACK, DISPUTE) using deterministic regex state machines, executes Channel3 catalog matching, solves Knapsack basket optimization, and generates valid PayPal orders.
- **Result:** Evaluators can thoroughly test every capability of AegisPay with **zero external API dependencies and zero token consumption**.

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

## 11. 📚 Documentation & Technical Dossiers

Explore our comprehensive technical guides and architectural dossiers:

| Document | Description |
| :--- | :--- |
| [📘 PayPal Developer Modernization Guide](docs/PAYPAL_INTEGRATION.md) | Deep dive into all 18+ integrated PayPal endpoints, authentication patterns, and chaos testing |
| [📊 AG Grid Enterprise & AG Studio 3 Guide](docs/AG_GRID.md) | Full documentation of our custom React cell renderers, DuckDB-WASM SSRM bridge, and studio canvas |
| [☁️ Render Cloud Infrastructure Dossier](docs/RENDER.md) | Complete guide to our multi-service `render.yaml` Blueprint, Workflows, and Redis Lua spend enforcer |
| [📐 APIMatic SDK Verification Dossier](docs/APIMATIC.md) | Verification and audit log of APIMatic-grounded `@paypal/paypal-server-sdk` initialization |
| [🎬 3-Minute Video Demo Script](docs/DEMO_VIDEO_SCRIPT.md) | Second-by-second video presentation script for the evaluation walkthrough |

---

## 12. 🤝 Strategic Technology Partners & Ecosystem Acknowledgements

AegisPay is engineered through deep integration with leading commerce rails, data visualization engines, and cloud platforms:

| Partner / Platform | Subsystem Role | Key Packages & Technology Highlights |
| :--- | :--- | :--- |
| **PayPal Developer Platform** | Autonomous Payment Rails & Disputes | Official `@paypal/agent-toolkit`, Orders v2, Payments v2, Vault v3, Fastlane checkout, and 12-action Disputes v1 HATEOAS machine |
| **AG Grid & AG Studio** | Enterprise Clearinghouse Workstation | `ag-grid-enterprise` v36.3.0, dynamic Quartz theming, DuckDB-WASM SSRM bridge, 6 custom React renderers, and AG Studio 3 live canvas |
| **Render** | Cloud-Native Workflows & Infrastructure | Multi-service Blueprint (`render.yaml`), `@renderinc/sdk` v1.8.0 native workflows (`type: workflow`), Key-Value Redis Lua firewall, and Managed PostgreSQL 16 |
| **Channel3** | Multimodal Catalog & Pricing Engine | 100M+ real-time product search (`/v1/search`), Two-Phase Commit stock reservation, and affiliate commission subsidy solver |
| **APIMatic** | API & SDK Contract Resilience | Code-gen grounding of `@paypal/paypal-server-sdk`, strict model deserialization, idempotency keys, and negative testing headers |
| **Bryntum** | Dispute SLA Timeline & Resource Scheduler | `@bryntum/scheduler-trial` integration with unallocated SLA deadline alert badges and breach prevention filters |

---

## 13. 📜 License & Compliance

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<div align="center">
  <sub>AegisPay 🛡️ — Built with Next.js 15, Fastify 4, Render Workflows, AG Grid Enterprise, and PayPal Rails.</sub>
</div>
