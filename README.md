# AegisPay 🛡️ — Autonomous Dual-Sided Agentic Commerce, Synthetic Intent Clearinghouse & Arbitration Cockpit

> **Target Competition:** Build What's Next with PayPal and AI Global Hackathon 2026  
> **Target Prize Pool ($34,500+ Combined Track Strategy):**  
> - 🏆 **Grand Prize ($12,000)**  
> - 🤖 **Best Use of PayPal + AI ($5,000)**  
> - ⚡ **Best Use of Agentic Commerce ($5,000)**  
> - 🎥 **Best Demo Delivery ($5,000)**  
> - **Sponsor Prize Tracks:** AG Grid / AG Studio 3 ($5,000), Channel3 ($1,500), APIMatic ($1,000), Bryntum ($1,000), Render ($1,000 Credits)  
>
> 📖 **Comprehensive Guides & Submission Deliverables:**  
> - [📊 AG Grid Enterprise & AG Studio 3 Architecture Guide](docs/AG_GRID.md)  
> - [📘 PayPal Developer Modernization & 18-Endpoint Integration Guide](docs/PAYPAL_INTEGRATION.md)  
> - [🎬 3-Minute Second-by-Second Demo Video Script](docs/DEMO_VIDEO_SCRIPT.md)  
> - [☁️ Render Cloud Infrastructure & Workflows Dossier](docs/RENDER.md)  
> - [📐 APIMatic SDK Verification Dossier](docs/APIMATIC.md)  

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vku588050/paypal-agentic-cockpit)

---

## 1. Executive Summary & Core Moats

AegisPay is a production-grade dual-sided agentic commerce platform that bridges autonomous consumer shopping agents with merchant clearinghouses, backstopped by zero-trust cryptographic spend enforcers, official `@paypal/agent-toolkit` bridges, and multi-modal dispute arbitration.

### Core Moats
1. **Official `@paypal/agent-toolkit` Bridge & Redis Lua Atomic Spend Enforcer (`packages/mcp-enforcer`):**
   - Wraps PayPal's official Agent Toolkit (`PayPalAgentToolkit` / `PayPalMCPToolkit` v1.11.0) behind an isolated zero-trust JSON-RPC/SSE proxy.
   - Validates hardware WebCrypto **Ed25519 `SessionMandate` policies** and executes single-threaded **Redis Lua scripts** on Render Key-Value (`{vch_<id>}` cluster hash tags) to block adversarial prompt injection and runaway spending in `< 1ms` before PayPal APIs are touched.
2. **Fastlane by PayPal 1-Click Passwordless Guest Checkout (`apps/web-cockpit`):**
   - Integrates Fastlane accelerated buyer device authentication into the PayPal JS SDK v6 Web Components mount.
   - Enables instant email lookup, passwordless payment method retrieval, and frictionless conversion to Vault v3 delegated spend mandates.
3. **Commission-Subsidized Multi-Vendor Knapsack Cart Optimizer (`apps/api-orchestrator`):**
   - Discovers offers across 100M+ products via Channel3 (`/v1/search` and `/v1/lookup` with promo code `PAYPAL-HACKATHON-2026`).
   - Solves an Integer Linear Programming (ILP) optimization balancing price, commission rebates ($\alpha = 0.75$), shipping waiver thresholds, and merchant anomaly scores into a single **PayPal Orders v2 Multi-Purchase-Unit `AUTHORIZE`** payload with individual merchant payee routing.
4. **Synthetic Intent Negotiation & Vault v3 Bidding (`apps/api-orchestrator`):**
   - When a desired basket exceeds budget caps by 5%–18%, the Buyer Agent mints a cryptographically bound **Synthetic Intent Voucher** anchored by a live **PayPal Vault v3 Setup Token (`/v3/vault/setup-tokens`)**.
   - Supports 2-turn bounded Dutch auction counter-bidding and 60-second real-time Human-in-the-Loop (HITL) push confirmation.
5. **72-Hour Price-Drop Escrow via Render Workflows (`apps/workflows`):**
   - Durable checkpointing (`ctx.step()`) polls Channel3 `/v1/lookup` during PayPal's 72-hour authorization window. Automatically captures lower prices (`POST /v2/payments/authorizations/{id}/capture`) or splits/voids without canceling unaffected items.
   - Extends authorization holds up to 29 days via `reauthorizeAuthorization` (`POST /v2/payments/authorizations/{id}/reauthorize`).
6. **12-Action Multi-Modal Dispute & Refund Arbiter (`apps/workflows`):**
   - APIMatic-grounded coverage of PayPal Disputes v1 with HATEOAS action resolution and appeals (`POST /v1/customer/disputes/{id}/appeal`).
   - Multimodal Vision comparisons (Channel3 studio `cleaned_url` vs. buyer return photo), EXIF tamper detection, and PayPal Shipment Tracking v1 (`/v1/shipping/trackers-batch`) calculate an orthogonal $(L, R) \in [0,1]^2$ Liability-Risk matrix.
   - Compiles in-memory forensic evidence dossiers via `pdf-lib` and uploads `multipart/form-data` to `/provide-evidence`. Generates automated prepaid return shipping labels with scannable QR codes for Tier 3 claims.
7. **Live `PayPal-Mock-Response` Chaos Simulator (`apps/web-cockpit`):**
   - Injects authentic `PayPal-Mock-Response` headers (`INSTRUMENT_DECLINED`, `COMPLIANCE_VIOLATION`) in PayPal Sandbox to verify that compensating Redis Lua rollbacks and financial ledgers handle bank declines in `< 1ms`.
8. **AG Grid Enterprise v36 + AG Studio 3 + DuckDB-WASM Clearinghouse Cockpit (`apps/web-cockpit`):**
   - **AG Grid Enterprise Suite**: Full tree-shakable module registry (`enterpriseModules.ts`), dynamic Quartz theming engine synchronized with dark/light mode (`useAgGridTheme.ts`), and 6 specialized React cell renderers (HATEOAS 2s hold buttons, SVG radial $(L, R)$ meters, Channel3 pristine vs return diffs, USPS trackers, monetary splits, SLA timers).
   - **Master/Detail Hierarchical Architecture**: Child sub-grids (`OrderDetailView`, `DisputeDetailView`) for multi-payee purchase units, Vault setup tokens, and embedded forensic evidence dossiers.
   - **DuckDB-WASM + SSRM OLAP Bridge**: AG Grid Server-Side Row Model powered directly by client-side DuckDB-WASM with parameterized SQL translation running sub-10ms queries over 100K+ records.
   - **In-Cell Sparklines & Integrated AG Charts**: Area sparklines for 30-day liquidity trends, column sparklines for synthetic bid velocity, and 1-click range-based chart creation.
   - **Live AG Studio 3 Canvas**: Active `<LiveStudioCanvas />` with multi-agent harness (`setupStudioHarness`), custom `paypal_arbiter` runner, and natural language command prompt bar.
   - **Financial Aggregations & Multi-Sheet Excel**: Row grouping by currency/status, bottom grand totals (`grandTotalRow: 'bottom'`), status bar summaries, real-time cell flashing (`applyTransactionAsync`), and native `.xlsx` multi-sheet workbook export. See [`docs/AG_GRID.md`](docs/AG_GRID.md).

---

## 2. 5-Sponsor Prize Track Alignment

| Sponsor Track | Prize | How AegisPay Integrates & Complies |
| :--- | :--- | :--- |
| **PayPal Core & Agentic Commerce** | $27,000 | Grounded Orders v2 (Multi-Purchase Units, AUTHORIZE/CAPTURE), Payments v2, Vault v3 Setup Tokens, Disputes v1 (12 actions), Shipment Tracking v1, Webhook cryptographic signature verification, and HTTP 402 / OpenAI ACP agent gateways. |
| **AG Grid / AG Studio 3** | $5,000 | **AG Grid Enterprise v36 Suite**: Master/Detail nested order grids (`OrderDetailView`), 6 custom React cell renderers, dynamic Quartz theming engine, DuckDB-WASM SSRM bridge (`DuckDbServerSideDatasource`), in-cell area/column sparklines, row grouping, pivot mode, real-time streaming flash, and native multi-sheet Excel export. **AG Studio 3 Canvas**: Active `<LiveStudioCanvas />` with multi-agent harness (`setupStudioHarness`), custom `paypal_arbiter` runner, and prompt bar executing cross-filtering and margin calculation commands. See [`docs/AG_GRID.md`](docs/AG_GRID.md). |
| **Channel3** | $1,500 | Multimodal product discovery (`/v1/search` with text, image, category ID, and hex palette), promo code `PAYPAL-HACKATHON-2026`, commission rebate subsidy solver, Two-Phase Commit (2PC) inventory pre-check, and 72-hour price-drop polling. |
| **APIMatic** | $1,000 | Grounded `@paypal/paypal-server-sdk` initialization, full schema validation, fault injection headers, idempotency tokens (`PayPal-Request-Id`), and comprehensive audit documentation in `docs/APIMATIC.md`. |
| **Bryntum** | $1,000 | `@bryntum/scheduler-trial` embedded in Merchant Cockpit with prominent **"Unallocated SLA Deadline"** badge, color-coded urgency indicators (Red <6h, Yellow vision triage, Green submitted), and 1-click **"Imminent Breach"** filter. |
| **Render** | $1,000 | Declarative multi-service Infrastructure-as-Code (`render.yaml`), Render Workflows durable task execution (`@renderinc/sdk` v1.8.0), Zero-Trust Key-Value (Redis) with `noeviction` Lua spend enforcer, Managed PostgreSQL 16 with `preDeployCommand` / `initialDeployHook`, and scheduled 6-hour cron reconciler. See [`docs/RENDER.md`](docs/RENDER.md). |

### 2.1 ☁️ Render Cloud Infrastructure & Workflows Deep-Dive

AegisPay is engineered as a cloud-native, multi-service deployment orchestrating AI agents, atomic financial ledgers, and durable background workflows on **Render**:

| Render Primitive | Service / Datastore | Purpose & Moat Rationale |
| :--- | :--- | :--- |
| **Render Workflows** | `aegispay-workflows` (`type: workflow`) | Durable execution engine built on `@renderinc/sdk` v1.8.0. Checkpoints (`ctx.step()`) long-running 72h price-drop polling, multimodal vision forensics, and Dutch auction synthetic bid matching with automatic retry backoff. |
| **Render Key-Value** | `aegispay-redis` (`type: keyvalue`) | Zero-trust private memory store (`ipAllowList: []`, `maxmemoryPolicy: noeviction`). Executes atomic single-threaded Redis Lua scripts (`{vch_<id>}`) enforcing buyer budget caps in $< 1\text{ms}$ before PayPal REST calls. |
| **Managed PostgreSQL 16** | `aegispay-postgres` (`databases`) | Double-entry financial ledger housing escrow orders and dispute forensics. Configured with automated `preDeployCommand` migrations and `initialDeployHook` seeding 1,000 sandbox records. |
| **Render Web Services** | `aegispay-api-orchestrator`<br/>`aegispay-web-cockpit` | High-availability Node 22 services running Fastify 4 (MCP Gateway & APIMatic client) and Next.js 15 (Dual-Sided Merchant/Buyer Cockpit + AG Studio 3). |
| **Render Cron** | `aegispay-cron-reconciler` (`type: cron`) | Scheduled periodic clearing engine (`0 */6 * * *`) pruning expired Dutch auction vouchers and reconciling pending holds against carrier APIs. |
| **Render Blueprint IaC** | `render.yaml` | Declarative Infrastructure-as-Code linking all 5 services with shared `envVarGroups` and automatic PR preview environments (`previews.generation: automatic`). |

> Complete sponsor compliance dossier and verification procedures: [`docs/RENDER.md`](docs/RENDER.md)

---

## 3. Agentic Commerce Protocol (ACP) Specification & Architecture

AegisPay natively implements the **Agentic Commerce Protocol (ACP)** specification maintained by OpenAI & Stripe, serving as an autonomous dual-sided clearinghouse connecting AI shopping agents with PayPal v2/v3 commerce rails.

### 3.1 Supported Protocol Versions & Discovery
- **Discovery Endpoint**: `GET /.well-known/acp.json`
- **Supported API Versions**: `2025-09-29`, `2025-12-12`, `2026-01-16`, `2026-01-30`, `2026-04-17` (Active Standard)
- **Advertised Transports**: `rest` (HTTPS REST endpoints) and `mcp` (Streamable HTTP JSON-RPC 2.0)
- **Advertised Services**: `checkout`, `delegate_payment`, `orders`, `actions`, `carts`

### 3.2 Protocol Endpoints & Capabilities
| Area | Path / Method | Spec Reference | Description |
| :--- | :--- | :--- | :--- |
| **Discovery** | `GET /.well-known/acp.json` | `rfcs/rfc.discovery.md` | Manifest advertising capabilities, versions, and payment handlers |
| **Checkout Session** | `POST /checkout_sessions` | `rfcs/rfc.agentic_checkout.md` | Initiates checkout session with tax estimation and shipping calculation |
| **Authoritative State** | `GET /checkout_sessions/{id}` | `rfcs/rfc.agentic_checkout.md` | Retrieves authoritative cart state and line item totals |
| **Session Update** | `POST /checkout_sessions/{id}` | `rfcs/rfc.agentic_checkout.md` | Full replacement update of line items, fulfillment, or buyer data |
| **Session Completion**| `POST /checkout_sessions/{id}/complete`| `rfcs/rfc.agentic_checkout.md` | Finalizes payment via Vault v3 or Ed25519 mandate and creates order |
| **Session Cancel** | `POST /checkout_sessions/{id}/cancel` | `rfcs/rfc.agentic_checkout.md` | Cancels session with optional intent trace data |
| **Pre-Checkout Cart** | `POST /carts` | `docs/sep-cart-capability.md` (SEP #187) | Lightweight basket building with non-authoritative estimated pricing |
| **Cart Operations** | `GET / PUT / POST /carts/{id}` | `docs/sep-cart-capability.md` (SEP #187) | Cart exploration, session persistence (7-day TTL), and handoff URLs |
| **MCP Streamable** | `POST /mcp` | `docs/mcp-binding.md` | JSON-RPC 2.0 binding exposing the 5 canonical ACP checkout tools |
| **Attribution** | `affiliate_attribution` payload | `rfcs/rfc.affiliate_attribution.md` | Privacy-preserving token attribution (first-touch and last-touch) |
| **Delegate Auth** | `POST /delegate_authentication` | `rfcs/rfc.delegate_authentication.md` | 3DS2 browser authentication session initiation and challenge |
| **Auth Result** | `GET /delegate_authentication/{id}` | `rfcs/rfc.delegate_authentication.md` | Retrieves 3DS authentication cryptogram and ECI indicators |
| **Delegate Payment**| `POST /agentic_commerce/delegate_payment`| `rfcs/rfc.delegate_payment.md`| Tokenizes credential into allowance-constrained Vault token (vt_...) |
| **Capability Neg.** | `capabilities` exchange | `rfcs/rfc.capability_negotiation.md` | Single-roundtrip server-side intersection of supported interventions |
| **Discount Ext.** | `discounts.codes` payload | `rfcs/rfc.discount_extension.md` | Rich applied promotions, priority stacking, and allocation breakdowns |
| **Order Tracking** | `GET /orders/{id}` | `rfcs/rfc.orders.md` | Rich post-purchase order tracking with 3-field quantity, fulfillments & adjustments |
| **Intent Tracing** | `intent_trace` on cancel | `rfcs/rfc.intent_traces.md` | Structured abandonment telemetry enabling programmatic Dutch auction bidding |
| **Marketing Consent**| `marketing_consents` payload | `rfcs/rfc.marketing_consent.md` | Three-phase consent capture (declare options, render UI, capture opt-in) |
| **Product Feeds** | `POST / GET /feeds` | `rfcs/rfc.product_feeds.md` | Product catalog ingestion, variant indexing, and merchandising surface |
| **Feed Items** | `POST / GET /feeds/{id}/items` | `rfcs/rfc.product_feeds.md` | Incremental catalog upserts, stock updates, and item lookup |
| **Payment Handlers** | `capabilities.payment_handlers` | `rfcs/rfc.payment_handlers.md` | Standardized payment method handlers with explicit credential delegation |
| **Seller-Backed Handlers**| `dev.acp.seller_backed.*` | `rfcs/rfc.seller_backed_payment_handler.md`| Zero-credential store credit, gift cards, and loyalty balance execution |
| **Active Schemas** | `spec/2026-04-17/json-schema/` | `spec/2026-04-17/` | Official 2026-04-17 JSON Schema bundles (checkout, cart, auth, payment, feed) |
| **ACP Webhooks** | `POST /api/webhooks/acp` | `spec/2026-04-17/openapi/openapi.agentic_checkout_webhook.yaml` | Order lifecycle webhooks (order_create, order_update) with signature verification |
| **OpenRPC Metadata** | `GET /.well-known/openrpc.json`| `spec/2026-04-17/openrpc/openrpc.agentic_checkout.json` | OpenRPC 1.3 schema describing MCP Streamable HTTP JSON-RPC 2.0 checkout tools |
| **OpenAPI 3.1 Specs**| `spec/2026-04-17/openapi/` | `spec/2026-04-17/` | Official OpenAPI 3.1 contracts (checkout, webhooks, cart, auth, payment, feeds) |
| **Unreleased Specs** | `spec/unreleased/json-schema/` | `spec/unreleased/` | Next-generation unreleased active development JSON Schema snapshots |

### 3.3 MCP Transport Binding for Checkout
Per `docs/mcp-binding.md`, AegisPay exposes 5 checkout tools over MCP:
1. `create_checkout_session`: `{ meta: { api_version, ... }, payload: { ... } }`
2. `get_checkout_session`: `{ meta: { api_version }, id: "cs_..." }`
3. `update_checkout_session`: `{ meta: { api_version }, id: "cs_...", payload: { ... } }`
4. `complete_checkout_session`: `{ meta: { api_version }, id: "cs_...", payload: { payment_method: { ... } } }`
5. `cancel_checkout_session`: `{ meta: { api_version }, id: "cs_...", payload?: { reason?: string } }`

**Uniform Error Codes**: ACP MCP errors uniformly return JSON-RPC `-32000` with detailed domain error data (`data: { type, code, message, param }`), and `-32602` for malformed envelope requests.

### 3.4 Fraud-Resistant Affiliate Attribution
Per `rfcs/rfc.affiliate_attribution.md`, attribution signals are captured at:
- **First-Touch**: `POST /checkout_sessions`
- **Last-Touch**: `POST /checkout_sessions/{id}/complete`
- **Write-Only Security Guarantee**: Attribution tokens and publisher identifiers are stored securely in internal session records and never echoed in public responses, preventing token leaks or competitor scraping.
- **Algorithmic Knapsack Integration**: In `cart-solver.ts`, affiliate commission rebates ($\alpha = 0.75$) directly subsidize multi-vendor cart splits before checkout authorization.

### 3.5 Full Protocol Migration Completion & Verification
The complete Agentic Commerce Protocol (ACP) specification across all releases has been 100% migrated, tested, and verified into AegisPay:
- **Core Protocol RFCs**: Capability Negotiation, Pre-Checkout Cart (SEP #187), Delegate Authentication (3DS2), Delegate Payment (Vault v3), Discount Extension, Discovery (`/.well-known/acp.json`), Extensions Framework, Intent Tracing, Marketing Consent, Enhanced Orders, Payment Handlers, Product Feeds, Seller-Backed Handlers, and Affiliate Attribution.
- **Active Release Specification (`spec/2026-04-17/`)**: Complete JSON Schema bundles, OpenAPI 3.1 contracts, and OpenRPC 1.3 MCP bindings.
- **Active Development Specification (`spec/unreleased/`)**: Complete next-generation JSON Schema bundles, OpenAPI 3.1 contracts, and OpenRPC 1.3 bindings.
- **Security & Integrity**: 4-Stage Custodian Security Gate (`packages/mcp-enforcer`), Redis Lua atomic spend limiter, and Ed25519 cryptographic session verifier actively protecting all commerce transactions.

---

## 4. Monorepo Architecture & Directory Topology

```
aegispay/
├── apps/
│   ├── api-orchestrator/       # Fastify 4 port 4000: PayPal Server SDK, Channel3, Knapsack, HITL
│   ├── web-cockpit/            # Next.js 15 + React 19: Buyer Portal, AG Studio 3, Bryntum SLA, /app/judge
│   └── workflows/              # Render Workflows: 72h watcher, vision arbiter, reverse shipping
├── packages/
│   ├── database/               # Drizzle ORM + PostgreSQL 16 schema & 1,000-row sandbox seeder
│   ├── mcp-enforcer/           # Standalone Proxy MCP Server + Redis Lua atomic spend limiter
│   └── shared-types/           # Canonical Zod schemas and TypeScript shared types
├── spec/                       # Official ACP 2026-04-17 & unreleased specifications
├── docs/
│   └── APIMATIC.md             # APIMatic Context Plugin audit log
└── render.yaml                 # Declarative Render Blueprint
```

---

## 5. Quickstart & Local Verification

### 5.1 Prerequisites
- Node.js >= 20.x (Node 22 recommended)
- `pnpm` >= 9.x (`npm install -g pnpm`)

### 5.2 Setup & Dependencies
```bash
# 1. Install all monorepo workspace dependencies
pnpm install

# 2. Seed 1,000 deterministic sandbox records (with automatic in-memory fallback)
pnpm --filter @aegispay/database db:seed
```

### 5.3 Run Test Suites
```bash
# Run tests across all workspace packages
pnpm test

# Run Chaos Simulator test suite
pnpm --filter @aegispay/web-cockpit test
```

### 5.4 Build Entire Monorepo
```bash
pnpm build
```

### 5.5 Start Applications
```bash
# Start Web Cockpit (Port 3000)
pnpm --filter @aegispay/web-cockpit dev

# Start API Orchestrator (Port 4000)
pnpm --filter @aegispay/api-orchestrator start
```

---

## 6. Devpost 3-Minute Video Demo Presentation Script

Visit **`http://localhost:3000/judge`** for the pre-authenticated, zero-friction 3-minute video presentation cockpit.

### [0:00 - 0:45] Act 1: Adversarial Prompt Injection Block
- **Narrative**: An external autonomous agent suffers a prompt-injection attack attempting a $5,000 unauthorized transaction over a $500 spend cap.
- **Action**: Click `[Trigger $5,000 Attack]`.
- **Outcome**: The standalone Proxy MCP Server executes the single-threaded Redis Lua script. The spend attempt is **atomically rejected in < 1ms (`ERR_EXCEEDS_TOTAL_MANDATE_BUDGET`)** before any PayPal REST API call occurs.

### [0:45 - 1:30] Act 2: Synthetic Intent Haggle & Vault Authorization
- **Narrative**: A buyer wants a $490 workstation bundle but has a $450 budget cap (8.89% overage). Standard checkout fails.
- **Action**: Click `[Trigger Synthetic Bid ($450)]`.
- **Outcome**: AegisPay mints a cryptographically bound `SyntheticIntentVoucher` anchored by a **PayPal Vault v3 Setup Token (`/v3/vault/setup-tokens`)**. The autonomous merchant agent verifies the bid exceeds its margin floor (saved Channel3 CAC) and captures the vaulted token instantly.

### [1:30 - 2:15] Act 3: Damaged Return Dispute Forensics & Auto-Adjudication
- **Narrative**: A fraudulent or damaged return claim is filed. Analysts are overwhelmed by deadlines.
- **Action**: Click `[Auto-Adjudicate Dispute]`.
- **Outcome**: The Render Workflow executes paired vision forensics (Channel3 `cleaned_url` vs. return photo), EXIF tamper detection, and carrier weight tracking. It compiles an in-memory `pdf-lib` dossier, streams it as `multipart/form-data` to PayPal Disputes v1 (`/provide-evidence`), and auto-adjudicates in seller favor.

### [2:15 - 3:00] Act 4: Knapsack Multi-Vendor Split & 72h Escrow Price Drop
- **Narrative**: Autonomous multi-merchant procurement with guaranteed price protection.
- **Action**: Click `[Trigger Knapsack + 72h Drop]`.
- **Outcome**: Knapsack solver splits items across vendors, waiving shipping thresholds and passing commission rebates. Places a PayPal Orders v2 multi-unit `AUTHORIZE` hold. The 72-hour watcher detects a 15% price drop on Channel3 and executes final capture at the lower price ($403.75), auto-refunding the difference to the buyer. Live `/api/integrations/verify` terminal displays verified PayPal server read-back.

---

## 7. License
MIT License • Built with pride for Build What's Next with PayPal and AI Global Hackathon.
