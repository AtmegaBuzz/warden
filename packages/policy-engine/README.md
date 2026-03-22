# @aspect-warden/policy-engine

Policy enforcement engine for AI agent wallets. Validates every transaction against configurable spending rules, anomaly detection, and on-chain constraints (EIP-7702).

## Install

```bash
npm install @aspect-warden/policy-engine
```

## Quick Start

```ts
import {
  PolicyEngine,
  AuditLogger,
  conservativePolicy,
} from '@aspect-warden/policy-engine';

// Create a policy from a built-in template
const policy = conservativePolicy('agent-1');

// Initialize the engine and audit logger
const engine = new PolicyEngine(policy);
const logger = new AuditLogger();

// Evaluate a transaction
const decision = engine.evaluate({
  to: '0xRecipientAddress',
  value: 5_000000n, // 5 USDT (6 decimals)
  token: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  chain: 'sepolia',
});

logger.log(decision);

console.log(decision.approved); // true
console.log(decision.riskScore); // 0-100
```

## Policy Templates

Built-in templates for common use cases:

```ts
import {
  conservativePolicy,  // max 10 USDT/tx, 50 USDT/day
  moderatePolicy,      // max 100 USDT/tx, 500 USDT/day
  aggressivePolicy,    // max 1000 USDT/tx, 5000 USDT/day
  transferOnlyPolicy,  // transfers only, no contract calls
  defiPolicy,          // DeFi-aware with Aave/Uniswap rules
  rampUpPolicy,        // limits increase over time
  tieredPolicy,        // different approval levels by amount
} from '@aspect-warden/policy-engine';
```

## Custom Policy

```ts
import type { AgentPolicy } from '@aspect-warden/policy-engine';

const policy: AgentPolicy = {
  agentId: 'my-agent',
  maxPerTx: 50_000000n,          // 50 USDT max per transaction
  dailyLimit: 200_000000n,       // 200 USDT daily cap
  weeklyLimit: 1000_000000n,     // 1,000 USDT weekly cap
  requireApprovalAbove: 40_000000n,
  allowedTokens: ['0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'],
  blockedTokens: [],
  allowedRecipients: [],         // empty = allow all
  blockedRecipients: [],
  allowedChains: ['sepolia'],
  cooldownMs: 30_000,            // 30s between transactions
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

## 19 Enforcement Rules

| Rule | Description |
|------|-------------|
| `maxPerTx` | Single transaction limit |
| `dailyLimit` | 24-hour rolling spending cap |
| `weeklyLimit` | 7-day rolling cap |
| `monthlyLimit` | 30-day rolling cap |
| `requireApprovalAbove` | Manual approval threshold |
| `cooldownMs` | Minimum time between transactions |
| `allowedTokens` | Token whitelist (empty = all) |
| `blockedTokens` | Token blacklist |
| `allowedRecipients` | Recipient whitelist (empty = all) |
| `blockedRecipients` | Recipient blacklist |
| `allowedChains` | Chain whitelist |
| `activeHoursUTC` | Time window restrictions |
| `minPerTx` | Minimum transaction amount |
| `maxTxPerDay` | Max transaction count per day |
| Anomaly detection | Velocity, bursts, escalation, concentration |
| Velocity ramp-up | Limits increase over time |
| Tiered authorization | Different approval by amount |
| Protocol policies | DeFi-specific rules (Aave, Uniswap) |
| Budget pool | Multi-agent shared spending limits |

## EIP-7702 On-Chain Enforcement

```ts
import { EIP7702Manager } from '@aspect-warden/policy-engine';

const manager = new EIP7702Manager({
  rpcUrl: 'https://rpc.sepolia.org',
  policyDelegateAddress: '0xYourDeployedContract',
});

// Delegate an EOA to the PolicyDelegate contract
await manager.delegateAccount(walletClient, policy);

// Create a scoped session key for a sub-agent
await manager.createSessionKey(walletClient, {
  eoa: '0xOwner',
  key: '0xSubAgent',
  maxPerTx: 10_000000n,
  dailyLimit: 50_000000n,
  validUntil: Math.floor(Date.now() / 1000) + 86400,
});
```

## Exports

```ts
// Core
PolicyEngine, PolicyAccount, AuditLogger, EIP7702Manager

// Templates
conservativePolicy, moderatePolicy, aggressivePolicy,
transferOnlyPolicy, defiPolicy, rampUpPolicy, tieredPolicy

// Multi-agent coordination
BudgetPool, ContractRiskClassifier, IndexerService

// Middleware
wardenMiddleware, PolicyWalletManager, ERC8004Manager

// Protocol policies
TRANSFER_ONLY, AAVE_SUPPLY_ONLY, AAVE_FULL,
UNISWAP_SWAP_ONLY, READ_ONLY

// Types
AgentPolicy, PolicyDecision, AuditEntry, RiskFactors,
AnomalyDetectionConfig, DefiPolicyConfig, IWalletAccount
```

## License

MIT
