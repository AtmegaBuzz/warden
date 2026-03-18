# Warden

**The firewall for AI agent wallets** — EIP-7702 policy enforcement powered by Tether WDK

> Built for the Tether Hackathon Galactica: WDK Edition 1 — Agent Wallets Track

## What It Does

AI agents with wallets need guardrails. Warden is a two-layer policy enforcement system that wraps any AI agent wallet with configurable spending limits, anomaly detection, and risk scoring — enforced both off-chain in TypeScript (for speed) and on-chain in Solidity (for tamper-proof guarantees). Using EIP-7702, agents keep their original EOA address while gaining smart-contract-level policy enforcement that the agent owner can configure and revoke at any time.

## Architecture

```
AI Agent ──> Warden Policy Engine ──> WDK Wallet ──> Sepolia
                    |                        |
             TypeScript layer          EIP-7702 Delegation
           (speed + flexibility)    (agent keeps EOA address)
                    |
          PolicyDelegate.sol
         (on-chain enforcement)
                    |
            MCP Server (11 tools)
                    |
           React Dashboard
```

**Two-layer defense:**
- **Off-chain (TypeScript)**: Sub-millisecond policy evaluation, risk scoring, anomaly detection, audit logging
- **On-chain (Solidity)**: Tamper-proof spending limits and recipient allowlists that the agent cannot bypass

## Features

- **Two-layer defense**: Off-chain TypeScript checks + on-chain Solidity enforcement
- **Session keys**: Scoped, time-limited permissions per agent
- **Spending limits**: Per-transaction and rolling 24-hour caps
- **Anomaly detection**: Velocity checks, recipient diversity, large transaction flags
- **Risk scoring**: 0-100 score on every transaction
- **Emergency freeze**: Halt all operations instantly
- **MCP server**: 11 callable tools for any AI agent framework
- **Real-time dashboard**: Monitor agents, view audit logs, control policies
- **EIP-7702 delegation**: Agents keep their EOA address, delegation is reversible

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

## Quick Start

```bash
git clone https://github.com/YOUR_REPO/warden.git
cd warden
npm install

# Run the multi-agent demo (standalone, no env vars needed)
npx tsx demo/multi-agent-demo.ts

# Run contract tests (24 passing)
cd packages/contracts && npx hardhat test

# Start the dashboard
cd packages/api-server && npm run dev &
cd packages/dashboard && npm run dev
# Open http://localhost:3002
```

## Using as npm Module

```typescript
import { PolicyEngine, EIP7702Manager, AuditLogger } from '@warden/policy-engine';

const engine = new PolicyEngine({
  agentId: 'my-agent',
  maxPerTx: 100_000000n,    // 100 USDT (6 decimals)
  dailyLimit: 500_000000n,  // 500 USDT
  cooldownMs: 30000,        // 30s between transactions
  requireApprovalAbove: 1000_000000n,
  allowedTokens: [],
  blockedTokens: [],
  allowedRecipients: [],
  blockedRecipients: [],
  allowedChains: ['sepolia'],
  anomalyDetection: {
    maxTxPerHour: 10,
    maxRecipientsPerHour: 5,
    largeTransactionPct: 50,
  },
});

const decision = engine.evaluate(recipientAddress, 50_000000n);
// { approved: true, riskScore: 25, reason: 'All policy checks passed', ... }

if (decision.approved) {
  engine.recordTransaction(50_000000n, recipientAddress);
}
```

## Project Structure

```
warden/
├── packages/
│   ├── contracts/          # Solidity — PolicyDelegate.sol + Hardhat tests
│   ├── policy-engine/      # TypeScript — PolicyEngine, AuditLogger, EIP7702Manager
│   ├── mcp-server/         # MCP server — 11 tools for AI agent frameworks
│   ├── api-server/         # Express API — bridges dashboard to policy engine
│   └── dashboard/          # React + Vite — real-time monitoring UI
├── demo/
│   └── multi-agent-demo.ts # Standalone demo (run with npx tsx)
└── package.json            # npm workspaces root
```

## Why Warden?

- Only project with **real EIP-7702 delegation** — not just documentation, working on-chain
- **Two-layer defense**: TypeScript speed + Solidity tamper-proof guarantees
- Working **MCP server** with 11 tools for any AI agent framework
- Uses **real Sepolia USDT** — no mock tokens
- **Reversible delegation** — agents keep their original address
- Production-ready **risk scoring** and **anomaly detection**

## License

MIT
