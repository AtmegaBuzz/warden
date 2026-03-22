# Warden

**The firewall for AI agent wallets** — EIP-7702 policy enforcement powered by Tether WDK

> Built for the Tether Hackathon Galactica: WDK Edition 1 — Agent Wallets Track

## What It Does

AI agents with wallets need guardrails. Warden is a two-layer policy enforcement system that wraps any AI agent wallet with configurable spending limits, anomaly detection, and risk scoring — enforced both off-chain in TypeScript (for speed) and on-chain in Solidity (for tamper-proof guarantees). Using EIP-7702, agents keep their original EOA address while gaining smart-contract-level policy enforcement that the agent owner can configure and revoke at any time.

## npm Packages

[![npm](https://img.shields.io/npm/v/@aspect-warden/policy-engine?label=%40aspect-warden%2Fpolicy-engine)](https://www.npmjs.com/package/@aspect-warden/policy-engine)
[![npm](https://img.shields.io/npm/v/@aspect-warden/mcp-server?label=%40aspect-warden%2Fmcp-server)](https://www.npmjs.com/package/@aspect-warden/mcp-server)

| Package | Description | Install |
|---------|-------------|---------|
| [`@aspect-warden/policy-engine`](https://www.npmjs.com/package/@aspect-warden/policy-engine) | 19-rule policy engine with anomaly detection and risk scoring | `npm install @aspect-warden/policy-engine` |
| [`@aspect-warden/mcp-server`](https://www.npmjs.com/package/@aspect-warden/mcp-server) | MCP server with 14 wallet tools for AI agents | `npm install @aspect-warden/mcp-server` |

## Quick Start

### 1. Use with Claude Desktop

Add to your `claude_desktop_config.json` (no cloning required):

```json
{
  "mcpServers": {
    "warden": {
      "command": "npx",
      "args": ["@aspect-warden/mcp-server"],
      "env": {
        "RPC_URL": "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
      }
    }
  }
}
```

Restart Claude Desktop and ask:

> "Create a conservative wallet with max $50/day spending on USDT."

The agent will call `warden_create_wallet`, `warden_transfer`, `warden_get_policy_status` and other tools automatically via MCP.

### 2. Use with OpenClaw

```bash
npx skills add tetherto/wdk-agent-skills
```

Then configure the MCP server in OpenClaw's settings with the same config as above.

### 3. Use as a TypeScript Library

```bash
npm install @aspect-warden/policy-engine
```

```typescript
import {
  PolicyEngine,
  AuditLogger,
  conservativePolicy,
} from '@aspect-warden/policy-engine';

// Use a pre-built template or create a custom policy
const engine = new PolicyEngine(conservativePolicy('my-agent'));
const logger = new AuditLogger();

// Every transaction is evaluated against 19 rules
const decision = engine.evaluate({
  to: '0xRecipient',
  value: 50_000000n,    // 50 USDT (6 decimals)
  token: '0xUSDT',
  chain: 'sepolia',
});

console.log(decision.approved);   // true
console.log(decision.riskScore);  // 0-100
console.log(decision.reason);     // 'All policy checks passed'

logger.log(decision);
```

#### Policy Templates

```typescript
import {
  conservativePolicy,  // max 10 USDT/tx, 50 USDT/day, anomaly detection ON
  moderatePolicy,      // max 100 USDT/tx, 500 USDT/day
  aggressivePolicy,    // max 1000 USDT/tx, 5000 USDT/day
  transferOnlyPolicy,  // transfers only, no contract interactions
  defiPolicy,          // DeFi-aware with Aave/Uniswap rules
  rampUpPolicy,        // limits that increase over time
  tieredPolicy,        // auto-approve / cooldown / manual approval by amount
} from '@aspect-warden/policy-engine';
```

#### Custom Policy

```typescript
import type { AgentPolicy } from '@aspect-warden/policy-engine';

const policy: AgentPolicy = {
  agentId: 'trading-bot',
  maxPerTx: 50_000000n,           // 50 USDT max per transaction
  dailyLimit: 200_000000n,        // 200 USDT daily cap
  weeklyLimit: 1000_000000n,      // 1,000 USDT weekly cap
  monthlyLimit: 3000_000000n,     // 3,000 USDT monthly cap
  requireApprovalAbove: 40_000000n,
  allowedTokens: ['0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'], // Sepolia USDT
  blockedTokens: [],
  allowedRecipients: [],          // empty = allow all
  blockedRecipients: [],
  allowedChains: ['sepolia'],
  cooldownMs: 30_000,             // 30s between transactions
  maxTxPerDay: 50,
  anomalyDetection: {
    maxTxPerHour: 10,
    maxRecipientsPerHour: 5,
    largeTransactionPct: 50,
    burstThreshold: 4,
    burstWindowMs: 60_000,
  },
};
```

## Architecture

```
AI Agent (Claude Desktop / OpenClaw / any MCP client)
    ↓ MCP Protocol (stdio)
@aspect-warden/mcp-server          ← npm install @aspect-warden/mcp-server
    ↓ validates every transaction
@aspect-warden/policy-engine       ← npm install @aspect-warden/policy-engine
    ↓ on-chain enforcement
PolicyDelegate.sol (EIP-7702 delegation on Sepolia)
    ↓ monitoring
Dashboard + API Server (audit logs, risk scores, freeze controls)
```

**Two-layer defense:**
- **Off-chain (TypeScript)**: Sub-millisecond policy evaluation, risk scoring, anomaly detection, audit logging
- **On-chain (Solidity)**: Tamper-proof spending limits and recipient allowlists that the agent cannot bypass

## MCP Tools (14)

| Category | Tool | Description |
|----------|------|-------------|
| **Wallet** | `warden_create_wallet` | Create a new agent wallet with policy |
| | `warden_get_balance` | Check ETH and token balances |
| | `warden_transfer` | Send tokens (validated against policy) |
| | `warden_get_audit_log` | Fetch transaction decision history |
| **Policy** | `warden_setup_policy` | Configure policy from natural language |
| | `warden_get_policy_status` | View spending status and limits |
| | `warden_update_policy` | Modify policy at runtime |
| **EIP-7702** | `warden_delegate_to_policy` | Delegate EOA to PolicyDelegate contract |
| | `warden_create_session_key` | Scoped sub-agent permissions |
| | `warden_revoke_session_key` | Revoke sub-agent access |
| **Safety** | `warden_freeze` | Emergency halt all operations |
| | `warden_unfreeze` | Resume after freeze |
| | `warden_register_identity` | Register on ERC-8004 identity registry |
| **Permissions** | `warden_grant_permissions` | Grant ERC-7715 permissions |

## Features

- **19 enforcement rules**: per-tx limits, daily/weekly/monthly caps, token/recipient allowlists, cooldowns, time windows, anomaly detection
- **8-factor risk scoring**: velocity, burn rate, recipient novelty, escalation, concentration, burst, deviation, timing
- **7 policy templates**: conservative, moderate, aggressive, transfer-only, DeFi, ramp-up, tiered
- **Session keys**: Scoped, time-limited permissions with function selector controls
- **Anomaly detection**: Burst patterns, escalation, concentration, statistical deviation
- **Emergency controls**: Freeze/unfreeze, dead man's switch
- **Cross-agent budget pools**: Shared spending limits across multiple agents
- **ERC-8004 identity**: Reputation-gated session key creation
- **Real-time dashboard**: Monitor agents, view audit logs, control policies

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.28, Hardhat, OpenZeppelin |
| Policy Engine | TypeScript, viem (EIP-7702) |
| MCP Server | @modelcontextprotocol/sdk, zod |
| Dashboard | React, Vite, Tailwind CSS, Recharts |
| API Server | Express, TypeScript |
| Network | Ethereum Sepolia Testnet |
| USDT | Real Sepolia USDT (`0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`) |

## Development

```bash
git clone https://github.com/AtmegaBuzz/warden.git
cd warden
npm install

# Build all packages
npm run build

# Run multi-agent demo (standalone, no env vars needed)
npm run demo

# Run tests
npm test                          # all tests
npm run test:contracts            # 66 Solidity tests
npm run test:engine               # 72 policy engine tests

# Start dashboard + API
npm run dev:all                   # http://localhost:3002

# Start MCP server standalone
npm run mcp
```

### Environment Variables

Copy `.env.example` to `.env`:

```bash
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0x...             # Sepolia wallet for gas
POLICY_DELEGATE_ADDRESS=0x...          # after deploying the contract
SEPOLIA_USDT_ADDRESS=0x7169D38820dfd117C3FA1f22a697dBA58d90BA06
```

## Project Structure

```
warden/
├── packages/
│   ├── policy-engine/      # @aspect-warden/policy-engine (npm)
│   ├── mcp-server/         # @aspect-warden/mcp-server (npm)
│   ├── contracts/          # PolicyDelegate.sol + Hardhat tests
│   ├── api-server/         # Express API for audit logs
│   └── dashboard/          # React monitoring UI
├── agents/
│   └── skills/
│       └── warden-wallet/  # OpenClaw agent skill (SKILL.md)
├── demo/
│   └── multi-agent-demo.ts # 3-agent policy demo
└── package.json            # npm workspaces root
```

## Standards

- **EIP-7702** — EOA delegation to PolicyDelegate contract
- **EIP-7715** — Permission grants for agents
- **EIP-7821** — Minimal batch executor
- **ERC-8004** — On-chain agent identity registry

## License

MIT
