# Warden Policy Engine API Reference

## Core Classes

### PolicyEngine
Evaluates transactions against 19 configurable rules.

```typescript
import { PolicyEngine } from '@aspect-warden/policy-engine'

const engine = new PolicyEngine(policy)
const decision = engine.evaluate(to, value, token?, chain?)
// { approved: boolean, reason: string, ruleTriggered: string | null, riskScore: number, riskFactors: {...} }

engine.recordTransaction(value, recipient)
engine.getSpendingStatus()
engine.updatePolicy(updates)
```

### PolicyAccount
Wraps any WDK account with policy enforcement.

```typescript
import { PolicyAccount } from '@aspect-warden/policy-engine'

const safe = new PolicyAccount(innerAccount, config, chain, eip7702Manager?)
await safe.sendTransaction({ to, value })     // throws PolicyError if blocked
await safe.transfer({ token, recipient, amount }) // throws PolicyError if blocked
safe.getSpendingStatus()
safe.getAuditLog()
safe.getAuditStats()
```

### EIP7702Manager
On-chain EIP-7702 delegation and session key management.

```typescript
import { EIP7702Manager } from '@aspect-warden/policy-engine'

const mgr = new EIP7702Manager({ providerUrl, policyDelegateAddress, privateKey })
await mgr.delegateToPolicy()
await mgr.initializePolicy(recovery, delay)
await mgr.createSessionKey({ agentAddress, maxPerTx, dailyLimit, validForSeconds, cooldownSeconds })
await mgr.revokeSessionKey(address)
await mgr.freeze()
await mgr.unfreeze()
await mgr.revokeDelegation()
await mgr.setFunctionPermission({ sessionKey, target, selector, allowed })
await mgr.setTokenAllowed(token, allowed)
await mgr.getSessionNonce(sessionKey)
```

### BudgetPool
Cross-agent shared spending limits.

```typescript
import { BudgetPool } from '@aspect-warden/policy-engine'

const pool = new BudgetPool({ poolId, totalDailyLimit, agentIds })
pool.canSpend(agentId, amount)  // { allowed, reason }
pool.recordSpend(agentId, amount)
pool.getRemainingBudget()
pool.getStatus()
```

### ContractRiskClassifier
Risk-based value limits per target contract.

```typescript
import { ContractRiskClassifier } from '@aspect-warden/policy-engine'

const classifier = new ContractRiskClassifier()
classifier.classify(address)  // { level: 'low'|'medium'|'high'|'critical', label, reason }
classifier.getMaxValueForRisk(level, baseMaxPerTx)
classifier.registerContract(address, level, label)
```

## Policy Templates

```typescript
import {
  conservativePolicy,  // Low limits, strict, business hours
  moderatePolicy,      // Balanced defaults
  aggressivePolicy,    // High-throughput trading
  transferOnlyPolicy,  // ERC-20 only, no contracts
  defiPolicy,          // Aave/DeFi with health factor
  rampUpPolicy,        // Graduated limits over 30 days
  tieredPolicy,        // Auto/cooldown/approval/multisig tiers
} from '@aspect-warden/policy-engine'
```

## Protocol Presets

```typescript
import {
  TRANSFER_ONLY,       // Only transfer(), no approve
  AAVE_SUPPLY_ONLY,    // Supply + withdraw, block borrow
  AAVE_FULL,           // All Aave operations
  UNISWAP_SWAP_ONLY,   // Single-hop swaps only
  READ_ONLY,           // No write operations
} from '@aspect-warden/policy-engine'
```

## USDT Amounts (6 decimals)

| Human | Code |
|-------|------|
| $1 | `1_000000n` |
| $10 | `10_000000n` |
| $100 | `100_000000n` |
| $1,000 | `1000_000000n` |
| $10,000 | `10000_000000n` |
