---
name: warden-wallet
description: AI agent wallet management with EIP-7702 policy enforcement on Tether WDK
version: 0.2.0
dependencies:
  - "@tetherto/wdk"
  - "@tetherto/wdk-wallet-evm"
  - "@warden/policy-engine"
  - "viem"
---

# Warden Wallet Skill

You are an AI agent with self-custodial wallet capabilities powered by Tether WDK,
wrapped in Warden's EIP-7702 policy enforcement layer.

## What You Can Do

1. **Create wallets** — generate new WDK wallets on EVM chains
2. **Check balances** — native tokens and ERC-20s (USDT, XAUT)
3. **Send transactions** — with automatic policy enforcement + anomaly detection
4. **Transfer tokens** — ERC-20 transfers within policy limits
5. **View policy status** — spending limits, remaining budget, risk scores, audit log
6. **Manage session keys** — create, revoke, check validity (via EIP-7702)
7. **Register identity** — register on ERC-8004 Agent Identity Registry
8. **Emergency controls** — freeze/unfreeze all operations instantly

## MCP Tools Available

When this skill is active, you have access to these MCP tools:

- `warden_create_wallet` — Create a new policy-enforced WDK wallet
- `warden_get_balance` — Check native + token balances
- `warden_transfer` — Send tokens with policy enforcement
- `warden_get_policy_status` — View current spending limits & remaining budget
- `warden_get_audit_log` — View transaction history with approve/block decisions
- `warden_update_policy` — Modify spending limits at runtime
- `warden_freeze` — Emergency freeze all operations
- `warden_unfreeze` — Resume operations after freeze
- `warden_create_session_key` — Create scoped session key for sub-agent
- `warden_revoke_session_key` — Remove session key access
- `warden_register_identity` — Register on ERC-8004 Identity Registry

## How to Create a Wallet

```typescript
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { PolicyAccount, EIP7702Manager } from '@warden/policy-engine'

const seed = WDK.getRandomSeedPhrase(24)
// IMPORTANT: Never log or expose seed phrases
const wdk = new WDK(seed)
  .registerWallet('ethereum', WalletManagerEvm, {
    provider: 'https://rpc.sepolia.org'
  })

const rawAccount = await wdk.getAccount('ethereum', 0)
```

## How to Wrap with Policy

```typescript
const safeAccount = new PolicyAccount(rawAccount, {
  underlying: WalletManagerEvm,
  provider: 'https://rpc.sepolia.org',
  policy: {
    agentId: 'my-agent',
    maxPerTx: 100_000000n,
    dailyLimit: 500_000000n,
    requireApprovalAbove: 200_000000n,
    allowedTokens: ['0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: ['ethereum'],
    cooldownMs: 30000,
    anomalyDetection: {
      maxTxPerHour: 20,
      maxRecipientsPerHour: 5,
      largeTransactionPct: 50,
    },
  }
}, 'ethereum')
```

## How to Set Up EIP-7702 On-Chain Enforcement

```typescript
import { EIP7702Manager } from '@warden/policy-engine'

const manager = new EIP7702Manager({
  providerUrl: 'https://rpc.sepolia.org',
  policyDelegateAddress: process.env.POLICY_DELEGATE_ADDRESS as `0x${string}`,
  privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
})

// Step 1: Delegate EOA to PolicyDelegate contract
await manager.delegateToPolicy()

// Step 2: Initialize policy on-chain
await manager.initializePolicy(recoveryAddress, 3600)

// Step 3: Create session key for this agent
await manager.createSessionKey({
  agentAddress: agentWalletAddress,
  maxPerTx: 100_000000n,
  dailyLimit: 500_000000n,
  validForSeconds: 86400,
  cooldownSeconds: 60,
})
```

## How to Send Tokens (Policy-Enforced)

```typescript
// Always quote first to estimate fees
const quote = await safeAccount.quoteTransfer({
  token: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  recipient: '0x...',
  amount: 50_000000n
})
console.log('Fee:', quote.fee)

// Then send — policy engine validates automatically
const result = await safeAccount.transfer({
  token: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  recipient: '0x...',
  amount: 50_000000n
})
console.log('Tx:', result.hash)
```

## Security Rules

- NEVER log seed phrases or private keys
- ALWAYS estimate fees before sending
- ALWAYS check the policy decision before proceeding
- If a transaction is blocked, explain WHY to the user (the reason is in the error)
- If human approval is required, wait for explicit confirmation
- Never bypass policy checks
- Monitor risk scores — flag anything above 70
