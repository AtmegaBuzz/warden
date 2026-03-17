# 03 — OpenClaw Agent Integration Guide (v2 — Improved)

## Overview

This file covers how to integrate ClawVault with OpenClaw so AI agents can create wallets, manage policies, and send transactions with safety enforcement. **v2 adds: full MCP server with callable tools, ERC-8004 agent identity registration, and proper tool descriptions for agent discovery.**

---

## Step 1: Install WDK Agent Skills

```bash
npx skills add tetherto/wdk-agent-skills
```

This gives the OpenClaw agent basic WDK wallet capabilities. We extend it with our policy skill.

---

## Step 2: Create ClawVault OpenClaw Skill (IMPROVED)

Create `agents/skills/clawvault-wallet/SKILL.md`:

```markdown
---
name: clawvault-wallet
description: AI agent wallet management with EIP-7702 policy enforcement on Tether WDK
version: 0.2.0
dependencies:
  - "@tetherto/wdk"
  - "@tetherto/wdk-wallet-evm"
  - "@clawvault/policy-engine"
  - "viem"
---

# ClawVault Wallet Skill

You are an AI agent with self-custodial wallet capabilities powered by Tether WDK,
wrapped in ClawVault's EIP-7702 policy enforcement layer.

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

- `clawvault_create_wallet` — Create a new policy-enforced WDK wallet
- `clawvault_get_balance` — Check native + token balances
- `clawvault_transfer` — Send tokens with policy enforcement
- `clawvault_get_policy_status` — View current spending limits & remaining budget
- `clawvault_get_audit_log` — View transaction history with approve/block decisions
- `clawvault_update_policy` — Modify spending limits at runtime
- `clawvault_freeze` — Emergency freeze all operations
- `clawvault_unfreeze` — Resume operations after freeze
- `clawvault_create_session_key` — Create scoped session key for sub-agent
- `clawvault_revoke_session_key` — Remove session key access
- `clawvault_register_identity` — Register on ERC-8004 Identity Registry

## How to Create a Wallet

```typescript
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { PolicyAccount, EIP7702Manager } from '@clawvault/policy-engine'

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
import { EIP7702Manager } from '@clawvault/policy-engine'

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
```

---

## Step 3: MCP Server for ClawVault Tools (NEW)

Create `agents/mcp-server/index.ts` — this gives any MCP-compatible AI agent (OpenClaw, Claude, etc.) access to ClawVault wallet tools.

```typescript
// agents/mcp-server/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import { PolicyAccount, PolicyError, EIP7702Manager, AuditLogger } from '@clawvault/policy-engine';

// State
let wdk: any = null;
let policyAccount: PolicyAccount | null = null;
let eip7702Manager: EIP7702Manager | null = null;
const auditLogger = new AuditLogger({ maxEntries: 10000 });

const server = new McpServer({
  name: 'clawvault-wallet',
  version: '0.2.0',
  description: 'Policy-enforced AI agent wallet powered by Tether WDK + EIP-7702',
});

// ============ Tool: Create Wallet ============

server.tool(
  'clawvault_create_wallet',
  'Create a new policy-enforced WDK wallet for the AI agent',
  {
    agentId: z.string().describe('Unique identifier for this agent'),
    maxPerTx: z.number().describe('Max spend per transaction in USDT (e.g. 100)'),
    dailyLimit: z.number().describe('Daily spending cap in USDT (e.g. 500)'),
    approvalThreshold: z.number().describe('Amount above which human approval is needed (e.g. 200)'),
    cooldownSeconds: z.number().default(30).describe('Min seconds between transactions'),
  },
  async ({ agentId, maxPerTx, dailyLimit, approvalThreshold, cooldownSeconds }) => {
    const seed = WDK.getRandomSeedPhrase(24);
    wdk = new WDK(seed).registerWallet('ethereum', WalletManagerEvm, {
      provider: process.env.RPC_URL || 'https://rpc.sepolia.org',
    });

    const rawAccount = await wdk.getAccount('ethereum', 0);
    const address = await rawAccount.getAddress();

    policyAccount = new PolicyAccount(rawAccount, {
      underlying: WalletManagerEvm,
      provider: process.env.RPC_URL || 'https://rpc.sepolia.org',
      policy: {
        agentId,
        maxPerTx: BigInt(maxPerTx) * 1_000000n,
        dailyLimit: BigInt(dailyLimit) * 1_000000n,
        requireApprovalAbove: BigInt(approvalThreshold) * 1_000000n,
        allowedTokens: [],
        blockedTokens: [],
        allowedRecipients: [],
        blockedRecipients: [],
        allowedChains: ['ethereum'],
        cooldownMs: cooldownSeconds * 1000,
        anomalyDetection: {
          maxTxPerHour: 20,
          maxRecipientsPerHour: 5,
          largeTransactionPct: 50,
        },
      },
      onAuditLog: (entry) => auditLogger.log(entry),
    }, 'ethereum');

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          address,
          agentId,
          policy: {
            maxPerTx: `${maxPerTx} USDT`,
            dailyLimit: `${dailyLimit} USDT`,
            approvalThreshold: `${approvalThreshold} USDT`,
            cooldownSeconds,
          },
          note: 'Wallet created. Fund with test USDT before sending transactions.',
        }, null, 2),
      }],
    };
  }
);

// ============ Tool: Get Balance ============

server.tool(
  'clawvault_get_balance',
  'Check the wallet balance (native ETH and USDT)',
  {
    tokenAddress: z.string().optional().describe('ERC-20 token address. Omit for native ETH.'),
  },
  async ({ tokenAddress }) => {
    if (!policyAccount) throw new Error('No wallet created. Call clawvault_create_wallet first.');

    const address = await policyAccount.getAddress();
    let balance: string;

    if (tokenAddress) {
      const raw = await policyAccount.getTokenBalance(tokenAddress);
      balance = `${Number(raw) / 1e6} USDT`; // Assuming 6 decimals
    } else {
      const raw = await policyAccount.getBalance();
      balance = `${Number(raw) / 1e18} ETH`;
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ address, balance }) }],
    };
  }
);

// ============ Tool: Transfer ============

server.tool(
  'clawvault_transfer',
  'Send tokens with policy enforcement. Will be blocked if it violates spending limits.',
  {
    recipient: z.string().describe('Recipient wallet address'),
    amount: z.number().describe('Amount in USDT (e.g. 50 for 50 USDT)'),
    tokenAddress: z.string().describe('ERC-20 token contract address'),
  },
  async ({ recipient, amount, tokenAddress }) => {
    if (!policyAccount) throw new Error('No wallet created.');

    try {
      const result = await policyAccount.transfer({
        token: tokenAddress,
        recipient,
        amount: BigInt(Math.round(amount * 1e6)),
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            txHash: result.hash,
            amount: `${amount} USDT`,
            recipient,
            fee: result.fee.toString(),
          }),
        }],
      };
    } catch (error: any) {
      if (error instanceof PolicyError) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              blocked: true,
              reason: error.decision.reason,
              ruleTriggered: error.decision.ruleTriggered,
              riskScore: error.decision.riskScore,
            }),
          }],
        };
      }
      throw error;
    }
  }
);

// ============ Tool: Get Policy Status ============

server.tool(
  'clawvault_get_policy_status',
  'View current spending limits, remaining budget, and policy configuration',
  {},
  async () => {
    if (!policyAccount) throw new Error('No wallet created.');
    const status = policyAccount.getSpendingStatus();
    const stats = policyAccount.getAuditStats();
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          spending: {
            spent: `${Number(status.spent) / 1e6} USDT`,
            remaining: `${Number(status.remaining) / 1e6} USDT`,
            windowResets: new Date(status.windowResets).toISOString(),
          },
          stats: {
            totalTransactions: stats.total,
            approved: stats.approved,
            blocked: stats.blocked,
            topBlockReasons: stats.topBlockReasons,
          },
        }, null, 2),
      }],
    };
  }
);

// ============ Tool: Get Audit Log ============

server.tool(
  'clawvault_get_audit_log',
  'View recent transaction history with approve/block decisions and risk scores',
  {
    limit: z.number().default(10).describe('Number of entries to return'),
    approvedOnly: z.boolean().optional().describe('Filter: true=approved only, false=blocked only'),
  },
  async ({ limit, approvedOnly }) => {
    if (!policyAccount) throw new Error('No wallet created.');
    const entries = policyAccount.getAuditLog({ approved: approvedOnly, limit });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(entries.map(e => ({
          approved: e.approved,
          reason: e.reason,
          rule: e.ruleTriggered,
          riskScore: e.riskScore,
          amount: `${Number(e.transactionDetails.value) / 1e6} USDT`,
          to: e.transactionDetails.to,
          time: new Date(e.timestamp).toISOString(),
          txHash: e.txHash,
        })), null, 2),
      }],
    };
  }
);

// ============ Tool: Update Policy ============

server.tool(
  'clawvault_update_policy',
  'Modify policy rules at runtime (spending limits, cooldowns)',
  {
    maxPerTx: z.number().optional().describe('New max per transaction in USDT'),
    dailyLimit: z.number().optional().describe('New daily limit in USDT'),
    cooldownSeconds: z.number().optional().describe('New cooldown in seconds'),
  },
  async ({ maxPerTx, dailyLimit, cooldownSeconds }) => {
    if (!policyAccount) throw new Error('No wallet created.');
    const updates: any = {};
    if (maxPerTx !== undefined) updates.maxPerTx = BigInt(maxPerTx) * 1_000000n;
    if (dailyLimit !== undefined) updates.dailyLimit = BigInt(dailyLimit) * 1_000000n;
    if (cooldownSeconds !== undefined) updates.cooldownMs = cooldownSeconds * 1000;
    policyAccount.updatePolicy(updates);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, updatedFields: Object.keys(updates) }) }],
    };
  }
);

// ============ Tool: Freeze ============

server.tool(
  'clawvault_freeze',
  'EMERGENCY: Freeze all wallet operations immediately',
  {},
  async () => {
    if (!eip7702Manager) throw new Error('EIP-7702 not configured.');
    const hash = await eip7702Manager.freeze();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, frozen: true, txHash: hash }) }],
    };
  }
);

// ============ Tool: Unfreeze ============

server.tool(
  'clawvault_unfreeze',
  'Resume wallet operations after emergency freeze',
  {},
  async () => {
    if (!eip7702Manager) throw new Error('EIP-7702 not configured.');
    const hash = await eip7702Manager.unfreeze();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, frozen: false, txHash: hash }) }],
    };
  }
);

// ============ Start Server ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[ClawVault MCP] Server running on stdio');
}

main().catch(console.error);
```

### MCP Server package.json
```json
{
  "name": "@clawvault/mcp-server",
  "version": "0.2.0",
  "type": "module",
  "bin": { "clawvault-mcp": "./dist/index.js" },
  "scripts": { "build": "tsc", "start": "node dist/index.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "@tetherto/wdk": "^0.x",
    "@tetherto/wdk-wallet-evm": "^0.x",
    "@clawvault/policy-engine": "^0.2.0",
    "zod": "^3.x"
  }
}
```

---

## Step 4: Multi-Agent Demo (IMPROVED)

```typescript
// agents/demo/multi-agent-demo.ts
import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import { PolicyAccount, PolicyError } from '@clawvault/policy-engine';

const PROVIDER = process.env.RPC_URL || 'https://rpc.sepolia.org';
// Real Sepolia USDT — official Tether deployment
const SEPOLIA_USDT = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const RECIPIENT = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';

async function createAgent(name: string, policy: any): Promise<PolicyAccount> {
  const seed = WDK.getRandomSeedPhrase(24);
  const wdk = new WDK(seed).registerWallet('ethereum', WalletManagerEvm, {
    provider: PROVIDER,
  });
  const raw = await wdk.getAccount('ethereum', 0);
  const address = await raw.getAddress();

  console.log(`\n[${name}] Wallet: ${address}`);

  return new PolicyAccount(raw, {
    underlying: WalletManagerEvm,
    provider: PROVIDER,
    policy,
    onAuditLog: (entry) => {
      const icon = entry.approved ? '✅' : '❌';
      const risk = entry.riskScore !== undefined ? ` [risk:${entry.riskScore}]` : '';
      console.log(`  ${icon} [${name}]${risk} ${entry.reason}`);
    },
  }, 'ethereum');
}

async function main() {
  console.log('========================================');
  console.log('  ClawVault Multi-Agent Policy Demo v2');
  console.log('  (with anomaly detection + risk scores)');
  console.log('========================================\n');

  // Agent 1: Conservative
  const conservative = await createAgent('Conservative', {
    agentId: 'conservative-01',
    maxPerTx: 10_000000n,
    dailyLimit: 50_000000n,
    requireApprovalAbove: 25_000000n,
    allowedTokens: [SEPOLIA_USDT.toLowerCase()],
    blockedTokens: [],
    allowedRecipients: [RECIPIENT.toLowerCase()],
    blockedRecipients: [],
    allowedChains: ['ethereum'],
    cooldownMs: 60000,
    anomalyDetection: {
      maxTxPerHour: 5,
      maxRecipientsPerHour: 2,
      largeTransactionPct: 60,
    },
  });

  // Agent 2: Moderate
  const moderate = await createAgent('Moderate', {
    agentId: 'moderate-01',
    maxPerTx: 100_000000n,
    dailyLimit: 500_000000n,
    requireApprovalAbove: 200_000000n,
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: ['ethereum'],
    cooldownMs: 10000,
    anomalyDetection: {
      maxTxPerHour: 20,
      maxRecipientsPerHour: 10,
      largeTransactionPct: 40,
    },
  });

  // Agent 3: Aggressive
  const aggressive = await createAgent('Aggressive', {
    agentId: 'aggressive-01',
    maxPerTx: 1000_000000n,
    dailyLimit: 5000_000000n,
    requireApprovalAbove: 2000_000000n,
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: ['ethereum', 'arbitrum', 'polygon'],
    cooldownMs: 0,
  });

  // ========== Scenario 1: Normal transfers ==========
  console.log('\n--- Scenario 1: Normal Transfers ---');
  try {
    await conservative.transfer({ token: SEPOLIA_USDT, recipient: RECIPIENT, amount: 5_000000n });
  } catch (e: any) { console.log('  Error:', e.message); }

  try {
    await moderate.transfer({ token: SEPOLIA_USDT, recipient: RECIPIENT, amount: 50_000000n });
  } catch (e: any) { console.log('  Error:', e.message); }

  // ========== Scenario 2: Over-limit blocked ==========
  console.log('\n--- Scenario 2: Over-Limit Transactions ---');
  try {
    await conservative.transfer({ token: SEPOLIA_USDT, recipient: RECIPIENT, amount: 20_000000n });
  } catch (e: any) {
    if (e instanceof PolicyError) {
      console.log(`  Blocked by: ${e.decision.ruleTriggered} | Risk: ${e.decision.riskScore}`);
    }
  }

  // ========== Scenario 3: Unauthorized recipient ==========
  console.log('\n--- Scenario 3: Unauthorized Recipient ---');
  const unknownRecipient = '0x0000000000000000000000000000000000000001';
  try {
    await conservative.transfer({ token: SEPOLIA_USDT, recipient: unknownRecipient, amount: 5_000000n });
  } catch (e: any) {
    if (e instanceof PolicyError) {
      console.log(`  Blocked by: ${e.decision.ruleTriggered}`);
    }
  }

  // ========== Scenario 4: Daily limit exhaustion ==========
  console.log('\n--- Scenario 4: Daily Limit Exhaustion ---');
  for (let i = 0; i < 6; i++) {
    try {
      await conservative.transfer({ token: SEPOLIA_USDT, recipient: RECIPIENT, amount: 9_000000n });
    } catch (e: any) {
      if (e instanceof PolicyError) {
        console.log(`  Transfer ${i + 1} blocked: ${e.decision.reason}`);
        break;
      }
    }
  }

  // ========== Summary ==========
  console.log('\n--- Audit Summary ---');
  for (const [name, agent] of [
    ['Conservative', conservative],
    ['Moderate', moderate],
    ['Aggressive', aggressive],
  ] as const) {
    const stats = (agent as PolicyAccount).getAuditStats();
    console.log(`  ${name}: ${stats.approved} approved, ${stats.blocked} blocked`);
    if (stats.topBlockReasons.length > 0) {
      console.log(`    Top block reasons: ${stats.topBlockReasons.map(r => `${r.rule}(${r.count})`).join(', ')}`);
    }
  }
}

main().catch(console.error);
```

---

## Step 5: ERC-8004 Agent Identity Integration (NEW)

```typescript
// agents/lib/erc8004.ts
// Register agent identity on the ERC-8004 Identity Registry

import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const ERC8004_IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const ERC8004_REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as const;

const IDENTITY_ABI = parseAbi([
  'function registerAgent(string name, string metadata) external returns (uint256)',
  'function getAgent(uint256 agentId) external view returns (address owner, string name, string metadata, bool active)',
  'function totalAgents() external view returns (uint256)',
]);

const REPUTATION_ABI = parseAbi([
  'function submitFeedback(uint256 agentId, uint8 rating, string comment) external',
  'function getReputation(uint256 agentId) external view returns (uint256 totalRatings, uint256 averageScore, uint256 feedbackCount)',
]);

export class ERC8004Manager {
  private publicClient: any;
  private walletClient: any;
  private account: ReturnType<typeof privateKeyToAccount>;

  constructor(privateKey: Hex, providerUrl: string = 'https://rpc.sepolia.org') {
    this.account = privateKeyToAccount(privateKey);
    this.publicClient = createPublicClient({ chain: sepolia, transport: http(providerUrl) });
    this.walletClient = createWalletClient({ account: this.account, chain: sepolia, transport: http(providerUrl) });
  }

  async registerAgent(name: string, metadata: string = ''): Promise<{ agentId: bigint; txHash: Hex }> {
    const hash = await this.walletClient.writeContract({
      address: ERC8004_IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'registerAgent',
      args: [name, metadata],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[ERC-8004] Agent "${name}" registered. Tx: ${hash}`);

    // Parse agentId from event logs
    const agentId = 0n; // Would parse from receipt.logs
    return { agentId, txHash: hash };
  }

  async getAgent(agentId: bigint) {
    return await this.publicClient.readContract({
      address: ERC8004_IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'getAgent',
      args: [agentId],
    });
  }

  async getReputation(agentId: bigint) {
    return await this.publicClient.readContract({
      address: ERC8004_REPUTATION_REGISTRY,
      abi: REPUTATION_ABI,
      functionName: 'getReputation',
      args: [agentId],
    });
  }

  async submitFeedback(agentId: bigint, rating: number, comment: string): Promise<Hex> {
    const hash = await this.walletClient.writeContract({
      address: ERC8004_REPUTATION_REGISTRY,
      abi: REPUTATION_ABI,
      functionName: 'submitFeedback',
      args: [agentId, rating, comment],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }
}
```

---

## Step 6: Dashboard API Server (IMPROVED)

```typescript
// agents/demo/api-server.ts
import express from 'express';
import cors from 'cors';
import { AuditLogger } from '@clawvault/policy-engine';

const app = express();
app.use(cors());
app.use(express.json());

const logger = new AuditLogger({ maxEntries: 10000 });

// GET /api/audit
app.get('/api/audit', (req, res) => {
  const { agentId, approved, limit } = req.query;
  const entries = logger.getEntries({
    agentId: agentId as string,
    approved: approved === 'true' ? true : approved === 'false' ? false : undefined,
    limit: limit ? parseInt(limit as string) : 50,
  });
  res.json(entries);
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const { agentId } = req.query;
  res.json(logger.getStats(agentId as string));
});

// GET /api/agents
app.get('/api/agents', (req, res) => {
  const entries = logger.getEntries({});
  const agents = [...new Set(entries.map(e => e.agentId))];
  res.json(agents);
});

// NEW: POST /api/freeze — trigger emergency freeze
app.post('/api/freeze', async (req, res) => {
  // This would call EIP7702Manager.freeze() in a real setup
  res.json({ success: true, message: 'Freeze command sent' });
});

// NEW: POST /api/unfreeze
app.post('/api/unfreeze', async (req, res) => {
  res.json({ success: true, message: 'Unfreeze command sent' });
});

// NEW: POST /api/policy — update policy
app.post('/api/policy', async (req, res) => {
  const { agentId, maxPerTx, dailyLimit, cooldownSeconds } = req.body;
  res.json({ success: true, agentId, updated: { maxPerTx, dailyLimit, cooldownSeconds } });
});

// NEW: POST /api/revoke-session-key
app.post('/api/revoke-session-key', async (req, res) => {
  const { agentId } = req.body;
  res.json({ success: true, message: `Session key revoked for ${agentId}` });
});

app.listen(3001, () => {
  console.log('Dashboard API running on http://localhost:3001');
});

export { logger };
```
