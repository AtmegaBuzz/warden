# Policy Examples — Natural Language to Code

## Example 1: Simple Payment Agent

**User says:** "I need a wallet for a payment bot. It should only send USDT, max $100 per payment, and no more than $500 a day."

**Policy:**
```typescript
{
  agentId: 'payment-bot',
  maxPerTx: 100_000000n,
  dailyLimit: 500_000000n,
  requireApprovalAbove: 80_000000n,
  allowedTokens: ['0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'],
  blockedTokens: [],
  allowedRecipients: [],
  blockedRecipients: [],
  allowedChains: ['sepolia'],
  cooldownMs: 10000,
  anomalyDetection: {
    maxTxPerHour: 15,
    maxRecipientsPerHour: 10,
    largeTransactionPct: 50,
    burstThreshold: 5,
    burstWindowMs: 60000,
  },
}
```

**Tell the user:**
> Your payment bot wallet is live. It can send up to $100 per transaction in USDT, with a $500 daily budget. 10-second cooldown between sends. Anomaly detection will flag bursts of 5+ rapid transactions.

---

## Example 2: Conservative Monitoring Agent

**User says:** "Create a read-only wallet for my monitoring agent. It shouldn't be able to spend anything."

**Policy:**
```typescript
{
  ...conservativePolicy('monitor-agent'),
  maxPerTx: 0n,
  dailyLimit: 0n,
  requireApprovalAbove: 0n,
}
```

**Tell the user:**
> Your monitoring agent wallet is ready. It can check balances and view transaction history, but it cannot send any transactions. All spending is blocked at the policy level.

---

## Example 3: DeFi Agent with Aave

**User says:** "I want a DeFi agent that can supply USDT to Aave to earn yield, but it should never borrow — I don't want leverage risk."

**Policy:**
```typescript
{
  ...defiPolicy('defi-agent'),
  allowedTokens: ['0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'],
  defiPolicy: {
    maxSupplyPerTx: 500_000000n,
    maxBorrowPerTx: 0n,          // borrowing disabled
    minHealthFactor: 999,         // effectively blocks borrow
    allowedSupplyTokens: ['0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'],
    allowedBorrowTokens: [],      // empty = nothing allowed
  },
}
```

**On-chain function selector permissions:**
```typescript
// Allow: supply() and withdraw()
await manager.setFunctionPermission({
  sessionKey: agentAddress,
  target: AAVE_V3_POOL,
  selector: '0x617ba037', // supply
  allowed: true,
})
await manager.setFunctionPermission({
  sessionKey: agentAddress,
  target: AAVE_V3_POOL,
  selector: '0x69328dec', // withdraw
  allowed: true,
})
// borrow selector is NOT added → blocked by default
```

**Tell the user:**
> Your DeFi agent can supply USDT to Aave V3 and withdraw it. Borrowing is completely blocked at both the policy engine and smart contract level. Maximum $500 per supply transaction.

---

## Example 4: Night-Blocked Trading Agent

**User says:** "Set up a trading bot but block it at night. Max $200 per trade, and if it starts escalating — sending bigger and bigger amounts — freeze it."

**Policy:**
```typescript
{
  ...moderatePolicy('trading-bot'),
  maxPerTx: 200_000000n,
  dailyLimit: 2000_000000n,
  activeHoursUTC: { start: 8, end: 22 },
  anomalyDetection: {
    maxTxPerHour: 20,
    maxRecipientsPerHour: 10,
    largeTransactionPct: 40,
    burstThreshold: 5,
    burstWindowMs: 120000,
    escalationWindowSize: 5,
    deviationMultiplier: 2.0,
  },
}
```

**Tell the user:**
> Your trading bot is set up with a $200 per-trade limit and $2,000 daily cap. It's only active from 8am to 10pm UTC — transactions outside those hours are automatically blocked. Anomaly detection monitors for escalation patterns (each trade bigger than the last) and will flag it immediately.

---

## Example 5: Graduated Trust (Ramp-Up)

**User says:** "I'm giving this agent a wallet but I don't fully trust it yet. Start with very low limits and increase them over a month."

**Policy:**
```typescript
{
  ...rampUpPolicy('new-agent'),
  velocityRampUp: {
    initialMaxPerTx: 5_000000n,    // Day 1: $5 max
    finalMaxPerTx: 200_000000n,    // Day 30: $200 max
    rampDays: 30,
    createdAt: Date.now(),
  },
  dailyLimit: 1000_000000n,
}
```

**Tell the user:**
> Your agent starts with a $5 per-transaction limit. Over the next 30 days, this limit gradually increases to $200 as the agent builds a track record. Daily budget is $1,000. This is the "earn trust over time" model.

---

## Example 6: Multi-Agent Shared Budget

**User says:** "I have 3 agents. They should share a $1000 daily budget between them — if one spends $800, the others only have $200 left."

**Implementation:**
```typescript
import { BudgetPool, moderatePolicy, PolicyEngine } from '@aspect-warden/policy-engine'

const pool = new BudgetPool({
  poolId: 'team-budget',
  totalDailyLimit: 1000_000000n,
  agentIds: ['agent-1', 'agent-2', 'agent-3'],
})

// Before each transaction, check the pool
const canSpend = pool.canSpend('agent-1', 200_000000n)
if (!canSpend.allowed) {
  console.log('Pool limit reached:', canSpend.reason)
}

// After successful transaction, record in pool
pool.recordSpend('agent-1', 200_000000n)
```

**Tell the user:**
> Your 3 agents share a $1,000 daily pool. Each agent also has its own individual limits, but the combined spending across all three cannot exceed $1,000/day. If Agent 1 spends $800, Agents 2 and 3 are left with $200 total.

---

## Example 7: Tiered Approval Flow

**User says:** "Small transactions should go through automatically. Medium ones need a cooldown. Big ones need my approval. Really big ones need multi-sig."

**Policy:**
```typescript
{
  ...tieredPolicy('tiered-agent'),
  tieredAuthorization: {
    tiers: [
      { maxValue: 50_000000n, action: 'auto_approve' },
      { maxValue: 200_000000n, action: 'cooldown_check', cooldownMs: 30000 },
      { maxValue: 500_000000n, action: 'require_approval' },
      { maxValue: 5000_000000n, action: 'require_multisig' },
    ],
  },
}
```

**Tell the user:**
> Your agent has 4 authorization tiers:
> - Under $50: auto-approved instantly
> - $50-$200: 30-second cooldown required
> - $200-$500: needs your manual approval
> - Over $500: needs multi-sig (multiple signers)
