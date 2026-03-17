# 05 — Submission Checklist & Demo Script (v2 — Improved)

## DoraHacks Submission Requirements

- [x] GitHub/GitLab/Bitbucket link
- [x] Demo video (required)
- [x] Fits Agent Wallets track
- [x] Also qualifies for Best Projects Overall

---

## GitHub Repository Checklist

### README.md Must Include:
- [ ] Project name + tagline: "ClawVault: The firewall for AI agent wallets"
- [ ] Architecture diagram (ASCII art from PROJECT-PLAN.md)
- [ ] What it does (2-3 sentences)
- [ ] Tech stack table
- [ ] Quick start (clone, install, run demo)
- [ ] How to use as npm module (code example)
- [ ] Link to demo video
- [ ] Link to deployed PolicyDelegate on Sepolia Etherscan
- [ ] Note: Uses real Sepolia USDT (`0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`)
- [ ] Screenshots of dashboard (with risk scores visible)

### Code Quality:
- [ ] All TypeScript compiles without errors
- [ ] Hardhat tests pass (aim for 15+ tests)
- [ ] No hardcoded private keys or seeds
- [ ] `.env.example` with all required variables
- [ ] Clean git history (squash fix commits)
- [ ] Uses **viem** (not ethers.js) for EIP-7702

### Working Demo:
- [ ] Multi-agent demo runs end-to-end with 3 agent profiles
- [ ] Dashboard loads and shows real data with risk scores
- [ ] At least one real transaction on Sepolia (with Etherscan link)
- [ ] Spending limit block is visible in audit log
- [ ] Anomaly detection triggers on velocity test
- [ ] Emergency freeze works (both API and dashboard button)
- [ ] Session key revocation works
- [ ] Agents funded with real Sepolia USDT from faucet

### Bonus Points:
- [ ] ERC-8004 agent identity registration working
- [ ] MCP server running with OpenClaw integration
- [ ] Multi-chain config (Sepolia + Arbitrum Sepolia)

---

## Demo Video Script (5 minutes)

### 0:00-0:30 — Problem Statement
"AI agents are getting wallets. But who controls the spending? Today, if an agent goes rogue, there's no firewall. ClawVault is the policy enforcement layer for agent wallets — built on Tether WDK with EIP-7702."

### 0:30-1:30 — Architecture
Show the architecture diagram. Explain:
- WDK creates the wallet (self-custodial, BIP-44)
- ClawVault wraps it with policy rules
- EIP-7702 enforces rules at the protocol level (not just TypeScript)
- Two layers: off-chain fast checks + on-chain tamper-proof enforcement
- **NEW**: Anomaly detection catches unusual patterns (velocity, new recipients)
- **NEW**: Risk scoring (0-100) on every transaction

### 1:30-3:00 — Live Demo
1. Show terminal: run `multi-agent-demo.ts`
2. Three agents created with different policies (Conservative/Moderate/Aggressive)
3. Conservative agent sends 5 USDT — approved, risk score shown
4. Conservative agent tries 20 USDT — BLOCKED (per-tx limit)
5. Show the audit log output with risk scores
6. Switch to dashboard: show StatsBar, TransactionLog with risk colors, SpendingChart
7. **NEW**: Click "Freeze Agent" on dashboard — show it actually calls the API
8. **NEW**: Show anomaly detection blocking rapid transactions
9. Show Etherscan: real Sepolia transactions with real USDT

### 3:00-4:00 — EIP-7702 Deep Dive
1. Show PolicyDelegate contract on Etherscan
2. Explain session keys: "Each agent gets scoped, time-limited permissions"
3. **CRITICAL**: Show actual `delegateToPolicy()` code using **viem** — not a placeholder
4. Show: `signAuthorization()` + `sendTransaction({ authorizationList })`
5. Show: create session key → validate transaction → revoke session key
6. Show: emergency freeze stops everything
7. "Unlike ERC-4337, the agent keeps its original address. Delegation is reversible."

### 4:00-4:30 — Why This Matters
"Any company deploying AI agents with wallets needs this. It's the firewall between the agent and your money. And it's a WDK module — any builder can npm install it."

**Key differentiators vs competitors:**
- Only project with real EIP-7702 delegation (not just talk about it)
- Two-layer defense (TypeScript + on-chain)
- Risk scoring and anomaly detection
- Working MCP server for any AI agent framework
- Reversible delegation — agents keep their address

### 4:30-5:00 — What's Next
- Multi-chain deployment (Arbitrum, Polygon, Base — all support EIP-7702)
- Integration with WDK's lending and swap modules (policy-enforced DeFi)
- MCP toolkit extension (policy-aware tools for any AI agent)
- ERC-8004 agent reputation tracking
- Publish as official WDK community module

---

## Key Talking Points for Judges

### On Technical Correctness:
"We built a proper WDK module using the `create-wdk-module` pattern. PolicyAccount wraps WalletAccountEvm and intercepts sendTransaction and transfer. The Solidity contract uses EIP-7702 session keys with per-transaction limits, daily caps, cooldowns, and token allowlists. **We use viem for EIP-7702 because ethers.js v6 doesn't support type 0x04 transactions.**"

### On Agent Autonomy:
"Agents operate fully autonomously within their policy bounds. No human in the loop unless the amount exceeds the approval threshold. Session keys are time-limited — they expire automatically. **Our anomaly detection catches unusual patterns without requiring manual intervention.**"

### On Economic Soundness:
"Every transaction is rate-limited and capped. Daily limits prevent drain attacks. Cooldowns prevent rapid-fire spending. **Anomaly detection flags velocity anomalies and new-recipient bursts.** Emergency freeze can halt everything in one transaction. The policy is enforced on-chain — even if the TypeScript layer is compromised."

### On Real-World Applicability:
"This is exactly what companies deploying financial AI agents need. AgentFabric ($24K grand prize at Cronos x402) won with a similar safety-first approach. ClawVault does it natively on WDK with the newest account abstraction standard. **We also provide an MCP server so any AI agent framework can use it, not just OpenClaw.**"

### On Why EIP-7702 Over ERC-4337:
"ERC-4337 creates a new address. EIP-7702 lets the agent keep its existing WDK wallet address while gaining smart contract enforcement. Delegation is reversible. It's cheaper (no bundler overhead). And WDK doesn't have a 7702 module yet — we're extending the ecosystem."

### On Anomaly Detection (NEW talking point):
"Beyond simple limits, we score every transaction for risk. Velocity checks catch rapid-fire drain attacks. Recipient diversity monitoring catches sweeping to many addresses. Large single-transaction detection catches attempts to max out in one shot. This is the ML-lite layer that makes ClawVault production-ready."

---

## Sepolia Test Tokens

Get test ETH on Sepolia:
- Pimlico faucet: https://faucet.pimlico.io
- Sepolia ETH faucet: https://sepoliafaucet.com

Get test USDT:
- **Real Sepolia USDT**: `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`
- Bitaps faucet: https://developer.bitaps.com/faucet (100 USDT per request)
- Get from any Sepolia USDT faucet or transfer from a funded wallet

---

## Contract Deployment Commands

```bash
cd packages/contracts

# Compile
npx hardhat compile

# Test (aim for 15+ passing)
npx hardhat test

# Deploy to Sepolia (deploys PolicyDelegate only — uses real Sepolia USDT)
npx hardhat run scripts/deploy.ts --network sepolia

# Verify on Etherscan
npx hardhat verify --network sepolia POLICY_DELEGATE_ADDRESS

# Fund agent wallets with real Sepolia USDT (transfer from deployer)
npx hardhat run scripts/fund-agents.ts --network sepolia -- 0xAgent1 0xAgent2
```

---

## Full Run Commands

```bash
# 1. Install all dependencies
npm install

# 2. Build contracts
cd packages/contracts && npx hardhat compile && cd ../..

# 3. Build policy engine
cd packages/policy-engine && npm run build && cd ../..

# 4. Deploy contracts (need Sepolia ETH)
cd packages/contracts && npx hardhat run scripts/deploy.ts --network sepolia && cd ../..

# 5. Run multi-agent demo
cd agents/demo && npx tsx multi-agent-demo.ts

# 6. Start dashboard API
cd agents/demo && npx tsx api-server.ts &

# 7. Start dashboard UI
cd packages/dashboard && npm run dev

# 8. (Optional) Start MCP server
cd agents/mcp-server && npx tsx index.ts
```

---

## Environment Variables (.env.example)

```env
# WDK
SEED_PHRASE=your_24_word_seed_phrase
RPC_URL=https://rpc.sepolia.org

# Contracts
DEPLOYER_PRIVATE_KEY=0x...
POLICY_DELEGATE_ADDRESS=0x...
SEPOLIA_USDT_ADDRESS=0x7169D38820dfd117C3FA1f22a697dBA58d90BA06

# Agent (for EIP-7702 delegation)
AGENT_PRIVATE_KEY=0x...

# Dashboard
VITE_API_URL=http://localhost:3001
VITE_RPC_URL=https://rpc.sepolia.org

# ERC-8004 (optional)
ERC8004_IDENTITY_REGISTRY=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
ERC8004_REPUTATION_REGISTRY=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
```
