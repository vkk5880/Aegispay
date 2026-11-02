# AegisPay 🛡️ — Autonomous Dual-Sided Agentic Commerce, Synthetic Intent Clearinghouse & Arbitration Cockpit

> **Target Competition:** Build What's Next with PayPal and AI Global Hackathon
> **Target Prize Pool ($34,500+ Combined Track Strategy):**
> - **PayPal Core Tracks:** Grand Prize ($12,000), Best Use of PayPal + AI ($5,000), Best Use of Agentic Commerce ($5,000), Best Demo Delivery ($5,000)
> - **Sponsor Prize Tracks:** AG Grid / AG Studio 3 ($5,000), Channel3 ($1,500), APIMatic ($1,000), Bryntum ($1,000), Render ($1,000 Credits)

---

## 1. Executive Summary & Core Moats

AegisPay is a production-grade dual-sided agentic commerce platform that bridges autonomous consumer shopping agents with merchant clearinghouses, backstopped by zero-trust cryptographic spend enforcers and multi-modal dispute arbitration.

### Core Moats
1. **Standalone Proxy MCP Server & Redis Lua Atomic Spend Enforcer (`packages/mcp-enforcer`):**
   - Wraps `@paypal/mcp` behind an isolated zero-trust JSON-RPC/SSE proxy.
   - Validates hardware WebCrypto **Ed25519 `SessionMandate` policies** and executes single-threaded **Redis Lua scripts** on Render Key-Value (`{vch_<id>}` cluster hash tags) to block adversarial prompt injection and runaway spending in `< 1ms` before PayPal APIs are touched.
2. **Commission-Subsidized Multi-Vendor Knapsack Cart Optimizer (`apps/api-orchestrator`):**
   - Discovers offers across 100M+ products via Channel3 (`/v1/search` and `/v1/lookup` with promo code `PAYPAL-HACKATHON-2026`).
   - Solves an Integer Linear Programming (ILP) optimization balancing price, commission rebates ($\alpha = 0.75$), shipping waiver thresholds, and merchant anomaly scores into a single **PayPal Orders v2 Multi-Purchase-Unit `AUTHORIZE`** payload.
3. **Synthetic Intent Negotiation & Vault v3 Bidding (`apps/api-orchestrator`):**
   - When a desired basket exceeds budget caps by 5%–18%, the Buyer Agent mints a cryptographically bound **Synthetic Intent Voucher** anchored by a live **PayPal Vault v3 Setup Token (`/v3/vault/setup-tokens`)**.
   - Supports 2-turn bounded Dutch auction counter-bidding and 60-second real-time Human-in-the-Loop (HITL) push confirmation.
4. **72-Hour Price-Drop Escrow via Render Workflows (`apps/workflows`):**
   - Durable checkpointing (`ctx.step()`) polls Channel3 `/v1/lookup` during PayPal's 72-hour authorization window. Automatically captures lower prices (`POST /v2/payments/authorizations/{id}/capture`) or splits/voids without canceling unaffected items.
5. **12-Action Multi-Modal Dispute & Refund Arbiter (`apps/workflows`):**
   - APIMatic-grounded coverage of PayPal Disputes v1.
   - Multimodal Vision comparisons (Channel3 studio `cleaned_url` vs. buyer return photo), EXIF tamper detection, and PayPal Shipment Tracking v1 (`/v1/shipping/trackers-batch`) calculate an orthogonal $(L, R) \in [0,1]^2$ Liability-Risk matrix.
   - Compiles in-memory forensic evidence dossiers via `pdf-lib` and uploads `multipart/form-data` to `/provide-evidence`. Generates automated prepaid return shipping labels with scannable QR codes for Tier 3 claims.
6. **AG Studio 3 + Bryntum SLA Scheduler + DuckDB-WASM Cockpit (`apps/web-cockpit`):**
   - AG Studio 3 (`@ag-grid/studio@3.0.0`) harness wiring 5 built-in agents plus custom `paypal_arbiter` specialist.
   - Sub-10ms in-browser OLAP queries via `@duckdb/duckdb-wasm`.
   - Bryntum SLA Scheduler (`@bryntum/scheduler-trial`) featuring an **"Unallocated SLA Deadline"** filter badge and urgent breach sorting.

---

## 2. 5-Sponsor Prize Track Alignment

| Sponsor Track | Prize | How AegisPay Integrates & Complies |
| :--- | :--- | :--- |
| **PayPal Core & Agentic Commerce** | $27,000 | Grounded Orders v2 (Multi-Purchase Units, AUTHORIZE/CAPTURE), Payments v2, Vault v3 Setup Tokens, Disputes v1 (12 actions), Shipment Tracking v1, Webhook cryptographic signature verification, and HTTP 402 / OpenAI ACP agent gateways. |
| **AG Grid / AG Studio 3** | $5,000 | AG Studio 3 AI harness (`createStudio` + `createAiHarness`), custom `paypal_arbiter` specialist via `clientToolRunner`, programmatic cross-filtering (`api.defineAiCommand`), calculated expression column (`Net_Retained_Margin`), custom SVG `EvidenceComparatorWidget`, and `HateoasDisputeActionRenderer` with safety hold. |
| **Channel3** | $1,500 | Multimodal product discovery (`/v1/search` with text, image, category ID, and hex palette), promo code `PAYPAL-HACKATHON-2026`, commission rebate subsidy solver, Two-Phase Commit (2PC) inventory pre-check, and 72-hour price-drop polling. |
| **APIMatic** | $1,000 | Grounded `@paypal/paypal-server-sdk` initialization, full schema validation, fault injection headers, idempotency tokens (`PayPal-Request-Id`), and comprehensive audit documentation in `docs/APIMATIC.md`. |
| **Bryntum** | $1,000 | `@bryntum/scheduler-trial` embedded in Merchant Cockpit with prominent **"Unallocated SLA Deadline"** badge, color-coded urgency indicators (Red <6h, Yellow vision triage, Green submitted), and 1-click **"Imminent Breach"** filter. |
| **Render** | $1,000 | Declarative multi-service Infrastructure-as-Code (`render.yaml`), Render Workflows durable task execution (`@renderinc/sdk`), Render Key-Value (Redis) Lua spend enforcer, and Render Managed PostgreSQL 16. |

---

## 3. Monorepo Architecture & Directory Topology

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
├── docs/
│   └── APIMATIC.md             # APIMatic Context Plugin audit log
└── render.yaml                 # Declarative Render Blueprint
```

---

## 4. Quickstart & Local Verification

### 4.1 Prerequisites
- Node.js >= 20.x (Node 22 recommended)
- `pnpm` >= 9.x (`npm install -g pnpm`)

### 4.2 Setup & Dependencies
```bash
# 1. Install all monorepo workspace dependencies
pnpm install

# 2. Seed 1,000 deterministic sandbox records (with automatic in-memory fallback)
pnpm --filter @aegispay/database db:seed
```

### 4.3 Run Test Suites
```bash
# Run tests across all workspace packages
pnpm test

# Run Chaos Simulator test suite
pnpm --filter @aegispay/web-cockpit test
```

### 4.4 Build Entire Monorepo
```bash
pnpm build
```

### 4.5 Start Applications
```bash
# Start Web Cockpit (Port 3000)
pnpm --filter @aegispay/web-cockpit dev

# Start API Orchestrator (Port 4000)
pnpm --filter @aegispay/api-orchestrator start
```

---

## 5. Devpost 3-Minute Video Demo Presentation Script

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

## 6. License
MIT License • Built with pride for Build What's Next with PayPal and AI Global Hackathon.
