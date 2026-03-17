#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  parseAbi,
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseUnits,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// ============================================================
// Configuration from environment
// ============================================================

const PROVIDER_URL = process.env.RPC_URL || 'https://rpc.sepolia.org';
const POLICY_DELEGATE_ADDRESS = process.env.POLICY_DELEGATE_ADDRESS as Address | undefined;
const SEPOLIA_USDT = (process.env.SEPOLIA_USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06') as Address;
const ERC8004_IDENTITY_REGISTRY = process.env.ERC8004_IDENTITY_REGISTRY as Address | undefined;

// ============================================================
// Inlined types from @clawvault/policy-engine
// ============================================================

interface AgentPolicy {
  agentId: string;
  maxPerTx: bigint;
  dailyLimit: bigint;
  requireApprovalAbove: bigint;
  allowedTokens: string[];
  blockedTokens: string[];
  allowedRecipients: string[];
  blockedRecipients: string[];
  allowedChains: string[];
  cooldownMs: number;
  anomalyDetection?: {
    maxTxPerHour: number;
    maxRecipientsPerHour: number;
    largeTransactionPct: number;
  };
  sessionKey?: {
    address: string;
    validUntil: number;
  };
}

interface PolicyDecision {
  approved: boolean;
  reason: string;
  ruleTriggered: string | null;
  timestamp: number;
  agentId: string;
  riskScore?: number;
  transactionDetails: {
    to: string;
    value: bigint;
    token?: string;
    chain: string;
  };
}

interface AuditEntry extends PolicyDecision {
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

interface SpendingTracker {
  spent: bigint;
  windowStart: number;
  lastTxTimestamp: number;
  txTimestamps: number[];
  recentRecipients: string[];
}

// ============================================================
// Contract ABIs
// ============================================================

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]);

const POLICY_DELEGATE_ABI = parseAbi([
  'function createSessionKey(address eoa, address key, uint256 maxPerTx, uint256 dailyLimit, uint48 validAfter, uint48 validUntil, uint256 cooldownSeconds) external',
  'function revokeSessionKey(address eoa, address key) external',
]);

const ERC8004_ABI = parseAbi([
  'function registerAgent(string name, string[] capabilities) external returns (uint256)',
  'event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)',
]);

// ============================================================
// Inlined PolicyEngine from @clawvault/policy-engine
// All 10 rules: maxPerTx, dailyLimit, cooldown, blockedToken,
// allowedTokens, blockedRecipient, allowedRecipients,
// allowedChains, anomalyDetection, requireApproval
// ============================================================

class PolicyEngine {
  private policy: AgentPolicy;
  private tracker: SpendingTracker;

  constructor(policy: AgentPolicy) {
    this.policy = policy;
    this.tracker = {
      spent: 0n,
      windowStart: Date.now(),
      lastTxTimestamp: 0,
      txTimestamps: [],
      recentRecipients: [],
    };
  }

  evaluate(to: string, value: bigint, token?: string, chain?: string): PolicyDecision {
    const base = {
      timestamp: Date.now(),
      agentId: this.policy.agentId,
      transactionDetails: { to, value, token, chain: chain || 'unknown' },
    };

    if (value > this.policy.maxPerTx) {
      return {
        ...base, approved: false,
        reason: `Amount ${value} exceeds per-transaction limit of ${this.policy.maxPerTx}`,
        ruleTriggered: 'maxPerTx',
      };
    }

    this.resetWindowIfExpired();
    if (this.tracker.spent + value > this.policy.dailyLimit) {
      return {
        ...base, approved: false,
        reason: `Daily spending would reach ${this.tracker.spent + value}, exceeding limit of ${this.policy.dailyLimit}`,
        ruleTriggered: 'dailyLimit',
      };
    }

    if (this.policy.cooldownMs > 0 && this.tracker.lastTxTimestamp > 0) {
      const elapsed = Date.now() - this.tracker.lastTxTimestamp;
      if (elapsed < this.policy.cooldownMs) {
        return {
          ...base, approved: false,
          reason: `Cooldown active. ${this.policy.cooldownMs - elapsed}ms remaining.`,
          ruleTriggered: 'cooldown',
        };
      }
    }

    if (token && this.policy.blockedTokens.length > 0 && this.policy.blockedTokens.includes(token.toLowerCase())) {
      return {
        ...base, approved: false,
        reason: `Token ${token} is blocked`,
        ruleTriggered: 'blockedToken',
      };
    }

    if (token && this.policy.allowedTokens.length > 0 && !this.policy.allowedTokens.includes(token.toLowerCase())) {
      return {
        ...base, approved: false,
        reason: `Token ${token} not in allowed list`,
        ruleTriggered: 'allowedTokens',
      };
    }

    const toLower = to.toLowerCase();
    if (this.policy.blockedRecipients.length > 0 && this.policy.blockedRecipients.includes(toLower)) {
      return {
        ...base, approved: false,
        reason: `Recipient ${to} is blocked`,
        ruleTriggered: 'blockedRecipient',
      };
    }

    if (this.policy.allowedRecipients.length > 0 && !this.policy.allowedRecipients.includes(toLower)) {
      return {
        ...base, approved: false,
        reason: `Recipient ${to} not in allowed list`,
        ruleTriggered: 'allowedRecipients',
      };
    }

    if (chain && this.policy.allowedChains.length > 0 && !this.policy.allowedChains.includes(chain)) {
      return {
        ...base, approved: false,
        reason: `Chain ${chain} not allowed`,
        ruleTriggered: 'allowedChains',
      };
    }

    if (this.policy.anomalyDetection) {
      const anomaly = this.checkAnomalies(to, value);
      if (anomaly) {
        return {
          ...base, approved: false,
          reason: anomaly,
          ruleTriggered: 'anomalyDetection',
          riskScore: 85,
        };
      }
    }

    if (value > this.policy.requireApprovalAbove) {
      return {
        ...base, approved: false,
        reason: `Amount ${value} exceeds approval threshold of ${this.policy.requireApprovalAbove}. Human approval required.`,
        ruleTriggered: 'requireApproval',
      };
    }

    const riskScore = this.calculateRiskScore(to, value);

    return {
      ...base,
      approved: true,
      reason: 'All policy checks passed',
      ruleTriggered: null,
      riskScore,
    };
  }

  private checkAnomalies(_to: string, value: bigint): string | null {
    const ad = this.policy.anomalyDetection!;
    const oneHourAgo = Date.now() - 3600000;

    this.tracker.txTimestamps = this.tracker.txTimestamps.filter(t => t > oneHourAgo);
    this.tracker.recentRecipients = this.tracker.recentRecipients.slice(-100);

    if (this.tracker.txTimestamps.length >= ad.maxTxPerHour) {
      return `Velocity anomaly: ${this.tracker.txTimestamps.length} transactions in the last hour (limit: ${ad.maxTxPerHour})`;
    }

    const recentUniqueRecipients = new Set(
      this.tracker.recentRecipients.filter((_, i) =>
        this.tracker.txTimestamps[i] && this.tracker.txTimestamps[i] > oneHourAgo
      )
    );
    if (recentUniqueRecipients.size >= ad.maxRecipientsPerHour) {
      return `Recipient anomaly: ${recentUniqueRecipients.size} unique recipients in last hour (limit: ${ad.maxRecipientsPerHour})`;
    }

    const pctOfDaily = Number(value * 100n / this.policy.dailyLimit);
    if (pctOfDaily >= ad.largeTransactionPct) {
      return `Large transaction: ${pctOfDaily}% of daily limit in single tx (threshold: ${ad.largeTransactionPct}%)`;
    }

    return null;
  }

  private calculateRiskScore(to: string, value: bigint): number {
    let score = 0;

    const pctOfMax = Number(value * 100n / this.policy.maxPerTx);
    score += Math.min(pctOfMax / 2, 30);

    if (!this.tracker.recentRecipients.includes(to.toLowerCase())) {
      score += 20;
    }

    if (this.tracker.lastTxTimestamp > 0) {
      const elapsed = Date.now() - this.tracker.lastTxTimestamp;
      if (elapsed < 60000) score += 15;
      else if (elapsed < 300000) score += 5;
    }

    const pctOfDaily = Number((this.tracker.spent + value) * 100n / this.policy.dailyLimit);
    if (pctOfDaily > 80) score += 20;
    else if (pctOfDaily > 50) score += 10;

    return Math.min(score, 100);
  }

  recordTransaction(value: bigint, recipient?: string): void {
    this.resetWindowIfExpired();
    this.tracker.spent += value;
    this.tracker.lastTxTimestamp = Date.now();
    this.tracker.txTimestamps.push(Date.now());
    if (recipient) {
      this.tracker.recentRecipients.push(recipient.toLowerCase());
    }
  }

  getSpendingStatus(): { spent: bigint; remaining: bigint; windowResets: number } {
    this.resetWindowIfExpired();
    return {
      spent: this.tracker.spent,
      remaining: this.policy.dailyLimit - this.tracker.spent,
      windowResets: this.tracker.windowStart + 24 * 60 * 60 * 1000,
    };
  }

  updatePolicy(updates: Partial<AgentPolicy>): void {
    Object.assign(this.policy, updates);
  }

  private resetWindowIfExpired(): void {
    const now = Date.now();
    if (now > this.tracker.windowStart + 24 * 60 * 60 * 1000) {
      this.tracker.spent = 0n;
      this.tracker.windowStart = now;
    }
  }
}

// ============================================================
// Inlined AuditLogger from @clawvault/policy-engine
// ============================================================

class AuditLogger {
  private entries: AuditEntry[] = [];
  private maxEntries: number;

  constructor(options?: { maxEntries?: number }) {
    this.maxEntries = options?.maxEntries ?? 10000;
  }

  log(decision: PolicyDecision, txResult?: { hash: string; blockNumber: number; gasUsed: bigint }): void {
    const entry: AuditEntry = {
      ...decision,
      txHash: txResult?.hash,
      blockNumber: txResult?.blockNumber,
      gasUsed: txResult?.gasUsed,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    const status = entry.approved ? 'APPROVED' : 'BLOCKED';
    console.error(
      `[AUDIT] ${status} | Agent: ${entry.agentId} | To: ${entry.transactionDetails.to} | ` +
      `Amount: ${entry.transactionDetails.value} | Risk: ${entry.riskScore ?? 'N/A'} | ` +
      `Rule: ${entry.ruleTriggered ?? 'none'} | Reason: ${entry.reason}`
    );
  }

  getEntries(filter?: {
    agentId?: string;
    approved?: boolean;
    since?: number;
    limit?: number;
  }): AuditEntry[] {
    let results = [...this.entries];
    if (filter?.agentId) results = results.filter(e => e.agentId === filter.agentId);
    if (filter?.approved !== undefined) results = results.filter(e => e.approved === filter.approved);
    if (filter?.since) results = results.filter(e => e.timestamp >= filter.since!);
    results.reverse();
    if (filter?.limit) results = results.slice(0, filter.limit);
    return results;
  }

  getStats(agentId?: string): {
    total: number;
    approved: number;
    blocked: number;
    topBlockReasons: Array<{ rule: string; count: number }>;
  } {
    const entries = agentId ? this.entries.filter(e => e.agentId === agentId) : this.entries;
    const approved = entries.filter(e => e.approved).length;
    const blocked = entries.filter(e => !e.approved);
    const reasonCounts = new Map<string, number>();
    for (const entry of blocked) {
      const rule = entry.ruleTriggered ?? 'unknown';
      reasonCounts.set(rule, (reasonCounts.get(rule) ?? 0) + 1);
    }
    return {
      total: entries.length,
      approved,
      blocked: blocked.length,
      topBlockReasons: Array.from(reasonCounts.entries())
        .map(([rule, count]) => ({ rule, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}

// ============================================================
// MCP Server State
// ============================================================

let policyEngine: PolicyEngine | null = null;
let auditLogger: AuditLogger | null = null;
let walletAddress: Address | null = null;
let frozen = false;

// Wallet key management (private key never exposed via MCP output)
let storedPrivateKey: Hex | null = null;
let publicClient: PublicClient | null = null;
let walletClient: WalletClient | null = null;

interface SessionKeyData {
  agentAddress: string;
  maxPerTx: bigint;
  dailyLimit: bigint;
  validUntil: number;
  cooldownSeconds: number;
  createdAt: number;
  revoked: boolean;
  txHash?: string;
}

const sessionKeys = new Map<string, SessionKeyData>();

// ============================================================
// BigInt-safe JSON serializer
// ============================================================

function toJSON(value: unknown, indent?: number): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === 'bigint' ? v.toString() : v as unknown
  , indent);
}

// ============================================================
// Client initialization helper
// ============================================================

function initializeClients(privateKey: Hex): void {
  const account = privateKeyToAccount(privateKey);

  publicClient = createPublicClient({
    chain: sepolia,
    transport: http(PROVIDER_URL),
  });

  walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(PROVIDER_URL),
  });

  storedPrivateKey = privateKey;
  walletAddress = account.address;
}

function requireWallet(): { publicClient: PublicClient; walletClient: WalletClient; address: Address } {
  if (!publicClient || !walletClient || !walletAddress || !storedPrivateKey) {
    throw new Error('No wallet created. Call clawvault_create_wallet first.');
  }
  return { publicClient, walletClient, address: walletAddress };
}

// ============================================================
// MCP Server Setup
// ============================================================

const server = new McpServer({
  name: 'clawvault-wallet',
  version: '0.3.0',
});

// ============================================================
// Tool 1: Create Wallet
// ============================================================

server.tool(
  'clawvault_create_wallet',
  'Create a new policy-enforced wallet for the AI agent. Generates a random Ethereum keypair, initializes viem clients for Sepolia, and sets up policy enforcement with spending limits, anomaly detection, and audit logging.',
  {
    agentId: z.string().describe('Unique identifier for this agent'),
    maxPerTx: z.number().describe('Max spend per transaction in USDT (e.g. 100)'),
    dailyLimit: z.number().describe('Daily spending cap in USDT (e.g. 500)'),
    approvalThreshold: z.number().describe('Amount above which human approval is needed (e.g. 200)'),
    cooldownSeconds: z.number().default(30).describe('Min seconds between transactions'),
  },
  async ({ agentId, maxPerTx, dailyLimit, approvalThreshold, cooldownSeconds }) => {
    const privateKey = generatePrivateKey();
    initializeClients(privateKey);

    const policy: AgentPolicy = {
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
    };

    policyEngine = new PolicyEngine(policy);
    auditLogger = new AuditLogger({ maxEntries: 10000 });
    frozen = false;

    return {
      content: [{
        type: 'text' as const,
        text: toJSON({
          success: true,
          address: walletAddress,
          agentId,
          chain: 'sepolia',
          rpcUrl: PROVIDER_URL,
          policy: {
            maxPerTx: `${maxPerTx} USDT`,
            dailyLimit: `${dailyLimit} USDT`,
            approvalThreshold: `${approvalThreshold} USDT`,
            cooldownSeconds,
          },
          note: 'Wallet created with policy enforcement. Fund with test ETH/USDT on Sepolia before sending transactions.',
        }, 2),
      }],
    };
  }
);

// ============================================================
// Tool 2: Get Balance
// ============================================================

server.tool(
  'clawvault_get_balance',
  'Check the wallet balance on Sepolia. Returns native ETH balance, or ERC-20 token balance if a token address is provided.',
  {
    tokenAddress: z.string().optional().describe('ERC-20 token address. Omit for native ETH.'),
  },
  async ({ tokenAddress }) => {
    let wallet: ReturnType<typeof requireWallet>;
    try {
      wallet = requireWallet();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: message }) }],
        isError: true,
      };
    }

    try {
      if (tokenAddress) {
        let decimals: number;
        try {
          decimals = await wallet.publicClient.readContract({
            address: tokenAddress as Address,
            abi: ERC20_ABI,
            functionName: 'decimals',
          });
        } catch {
          // Default to 6 decimals (USDT standard) if decimals() call fails
          decimals = 6;
        }

        const tokenBalance = await wallet.publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [wallet.address],
        });

        const formatted = formatUnits(tokenBalance, decimals);

        return {
          content: [{
            type: 'text' as const,
            text: toJSON({
              address: wallet.address,
              tokenAddress,
              balance: formatted,
              decimals,
              rawBalance: tokenBalance.toString(),
            }),
          }],
        };
      }

      const ethBalance = await wallet.publicClient.getBalance({ address: wallet.address });
      const formatted = formatEther(ethBalance);

      return {
        content: [{
          type: 'text' as const,
          text: toJSON({
            address: wallet.address,
            balance: `${formatted} ETH`,
            rawBalance: ethBalance.toString(),
          }),
        }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: `Failed to fetch balance: ${message}` }) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool 3: Transfer
// ============================================================

server.tool(
  'clawvault_transfer',
  'Send ERC-20 tokens with policy enforcement. Evaluates the transfer against all 10 policy rules including spending limits, cooldowns, and anomaly detection. Submits the transaction on-chain if approved.',
  {
    recipient: z.string().describe('Recipient wallet address (0x...)'),
    amount: z.number().describe('Amount in USDT (e.g. 50 for 50 USDT)'),
    tokenAddress: z.string().describe('ERC-20 token contract address'),
  },
  async ({ recipient, amount, tokenAddress }) => {
    if (!policyEngine || !auditLogger) {
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: 'No wallet created. Call clawvault_create_wallet first.' }) }],
        isError: true,
      };
    }

    let wallet: ReturnType<typeof requireWallet>;
    try {
      wallet = requireWallet();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: message }) }],
        isError: true,
      };
    }

    if (frozen) {
      return {
        content: [{
          type: 'text' as const,
          text: toJSON({
            success: false,
            blocked: true,
            reason: 'Wallet is frozen. All operations are suspended.',
            ruleTriggered: 'frozen',
          }),
        }],
      };
    }

    const valueMicro = BigInt(Math.round(amount * 1e6));
    const decision = policyEngine.evaluate(recipient, valueMicro, tokenAddress, 'ethereum');
    auditLogger.log(decision);

    if (!decision.approved) {
      return {
        content: [{
          type: 'text' as const,
          text: toJSON({
            success: false,
            blocked: true,
            reason: decision.reason,
            ruleTriggered: decision.ruleTriggered,
            riskScore: decision.riskScore,
          }),
        }],
      };
    }

    try {
      // ERC-20 transfer: encode transfer(recipient, amount) calldata
      const transferAmount = parseUnits(amount.toString(), 6);

      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient as Address, transferAmount],
      });

      const account = privateKeyToAccount(storedPrivateKey!);

      const hash = await wallet.walletClient.sendTransaction({
        account,
        to: tokenAddress as Address,
        data,
        chain: sepolia,
      });

      const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'reverted') {
        return {
          content: [{
            type: 'text' as const,
            text: toJSON({
              success: false,
              error: 'Transaction reverted on-chain',
              txHash: hash,
              blockNumber: Number(receipt.blockNumber),
            }),
          }],
          isError: true,
        };
      }

      policyEngine.recordTransaction(valueMicro, recipient);

      auditLogger.log(decision, {
        hash,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed,
      });

      return {
        content: [{
          type: 'text' as const,
          text: toJSON({
            success: true,
            txHash: hash,
            blockNumber: Number(receipt.blockNumber),
            gasUsed: receipt.gasUsed.toString(),
            amount: `${amount} USDT`,
            recipient,
            riskScore: decision.riskScore,
          }),
        }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: `Transfer failed: ${message}` }) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool 4: Get Policy Status
// ============================================================

server.tool(
  'clawvault_get_policy_status',
  'View current spending limits, remaining budget, window reset time, and audit statistics including approved/blocked counts and top block reasons.',
  {},
  async () => {
    if (!policyEngine || !auditLogger) {
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: 'No wallet created. Call clawvault_create_wallet first.' }) }],
        isError: true,
      };
    }

    const status = policyEngine.getSpendingStatus();
    const stats = auditLogger.getStats();

    return {
      content: [{
        type: 'text' as const,
        text: toJSON({
          frozen,
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
          activeSessionKeys: sessionKeys.size,
        }, 2),
      }],
    };
  }
);

// ============================================================
// Tool 5: Get Audit Log
// ============================================================

server.tool(
  'clawvault_get_audit_log',
  'View recent transaction history with approve/block decisions, risk scores, and triggered rules. Supports filtering by approval status.',
  {
    limit: z.number().default(10).describe('Number of entries to return'),
    approvedOnly: z.boolean().optional().describe('Filter: true=approved only, false=blocked only, omit=all'),
  },
  async ({ limit, approvedOnly }) => {
    if (!auditLogger) {
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: 'No wallet created. Call clawvault_create_wallet first.' }) }],
        isError: true,
      };
    }

    const entries = auditLogger.getEntries({ approved: approvedOnly, limit });

    return {
      content: [{
        type: 'text' as const,
        text: toJSON(entries.map(e => ({
          approved: e.approved,
          reason: e.reason,
          rule: e.ruleTriggered,
          riskScore: e.riskScore,
          amount: `${Number(e.transactionDetails.value) / 1e6} USDT`,
          to: e.transactionDetails.to,
          time: new Date(e.timestamp).toISOString(),
          txHash: e.txHash,
        })), 2),
      }],
    };
  }
);

// ============================================================
// Tool 6: Update Policy
// ============================================================

server.tool(
  'clawvault_update_policy',
  'Modify policy rules at runtime. Can update per-transaction limits, daily limits, and cooldown periods without recreating the wallet.',
  {
    maxPerTx: z.number().optional().describe('New max per transaction in USDT'),
    dailyLimit: z.number().optional().describe('New daily limit in USDT'),
    cooldownSeconds: z.number().optional().describe('New cooldown in seconds'),
  },
  async ({ maxPerTx, dailyLimit, cooldownSeconds }) => {
    if (!policyEngine) {
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: 'No wallet created. Call clawvault_create_wallet first.' }) }],
        isError: true,
      };
    }

    const updates: Partial<AgentPolicy> = {};
    const updatedFields: string[] = [];

    if (maxPerTx !== undefined) {
      updates.maxPerTx = BigInt(maxPerTx) * 1_000000n;
      updatedFields.push('maxPerTx');
    }
    if (dailyLimit !== undefined) {
      updates.dailyLimit = BigInt(dailyLimit) * 1_000000n;
      updatedFields.push('dailyLimit');
    }
    if (cooldownSeconds !== undefined) {
      updates.cooldownMs = cooldownSeconds * 1000;
      updatedFields.push('cooldownMs');
    }

    policyEngine.updatePolicy(updates);

    return {
      content: [{
        type: 'text' as const,
        text: toJSON({ success: true, updatedFields }),
      }],
    };
  }
);

// ============================================================
// Tool 7: Freeze
// ============================================================

server.tool(
  'clawvault_freeze',
  'EMERGENCY: Freeze all wallet operations immediately. No transfers will be allowed until unfrozen.',
  {},
  async () => {
    frozen = true;

    return {
      content: [{
        type: 'text' as const,
        text: toJSON({
          success: true,
          frozen: true,
          message: 'All wallet operations are now frozen.',
        }),
      }],
    };
  }
);

// ============================================================
// Tool 8: Unfreeze
// ============================================================

server.tool(
  'clawvault_unfreeze',
  'Resume wallet operations after an emergency freeze.',
  {},
  async () => {
    frozen = false;

    return {
      content: [{
        type: 'text' as const,
        text: toJSON({
          success: true,
          frozen: false,
          message: 'Wallet operations have been resumed.',
        }),
      }],
    };
  }
);

// ============================================================
// Tool 9: Create Session Key (on-chain via PolicyDelegate)
// ============================================================

server.tool(
  'clawvault_create_session_key',
  'Create a scoped session key for a sub-agent with its own spending limits and validity period. Requires POLICY_DELEGATE_ADDRESS env var for on-chain EIP-7702 session key creation.',
  {
    agentAddress: z.string().describe('Sub-agent wallet address to grant session key to'),
    maxPerTx: z.number().describe('Max spend per transaction in USDT for this session key'),
    dailyLimit: z.number().describe('Daily spending cap in USDT for this session key'),
    validForSeconds: z.number().describe('How long this session key is valid (seconds)'),
    cooldownSeconds: z.number().describe('Min seconds between transactions for this session key'),
  },
  async ({ agentAddress, maxPerTx, dailyLimit, validForSeconds, cooldownSeconds }) => {
    if (!POLICY_DELEGATE_ADDRESS) {
      return {
        content: [{
          type: 'text' as const,
          text: toJSON({ error: 'On-chain session key creation requires POLICY_DELEGATE_ADDRESS env var to be set.' }),
        }],
        isError: true,
      };
    }

    let wallet: ReturnType<typeof requireWallet>;
    try {
      wallet = requireWallet();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: message }) }],
        isError: true,
      };
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const maxPerTxWei = BigInt(maxPerTx) * 1_000000n;
      const dailyLimitWei = BigInt(dailyLimit) * 1_000000n;

      const data = encodeFunctionData({
        abi: POLICY_DELEGATE_ABI,
        functionName: 'createSessionKey',
        args: [
          wallet.address,
          agentAddress as Address,
          maxPerTxWei,
          dailyLimitWei,
          now,
          now + validForSeconds,
          BigInt(cooldownSeconds),
        ],
      });

      const account = privateKeyToAccount(storedPrivateKey!);

      const hash = await wallet.walletClient.sendTransaction({
        account,
        to: wallet.address,
        data,
        chain: sepolia,
      });

      const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'reverted') {
        return {
          content: [{
            type: 'text' as const,
            text: toJSON({
              success: false,
              error: 'Session key creation transaction reverted',
              txHash: hash,
            }),
          }],
          isError: true,
        };
      }

      const sessionData: SessionKeyData = {
        agentAddress,
        maxPerTx: maxPerTxWei,
        dailyLimit: dailyLimitWei,
        validUntil: (now + validForSeconds) * 1000,
        cooldownSeconds,
        createdAt: Date.now(),
        revoked: false,
        txHash: hash,
      };

      sessionKeys.set(agentAddress.toLowerCase(), sessionData);

      return {
        content: [{
          type: 'text' as const,
          text: toJSON({
            success: true,
            sessionKeyAddress: agentAddress,
            grantedTo: agentAddress,
            txHash: hash,
            blockNumber: Number(receipt.blockNumber),
            permissions: {
              maxPerTx: `${maxPerTx} USDT`,
              dailyLimit: `${dailyLimit} USDT`,
              cooldownSeconds,
            },
            validUntil: new Date(sessionData.validUntil).toISOString(),
          }, 2),
        }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: `Session key creation failed: ${message}` }) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool 10: Revoke Session Key
// ============================================================

server.tool(
  'clawvault_revoke_session_key',
  'Revoke a previously created session key, immediately disabling its access. If POLICY_DELEGATE_ADDRESS is set, also revokes on-chain.',
  {
    sessionKeyAddress: z.string().describe('Address of the session key to revoke'),
  },
  async ({ sessionKeyAddress }) => {
    const key = sessionKeyAddress.toLowerCase();
    const session = sessionKeys.get(key);

    if (!session) {
      return {
        content: [{
          type: 'text' as const,
          text: toJSON({
            success: false,
            error: `Session key ${sessionKeyAddress} not found.`,
          }),
        }],
        isError: true,
      };
    }

    if (POLICY_DELEGATE_ADDRESS && publicClient && walletClient && storedPrivateKey) {
      try {
        const wallet = requireWallet();
        const account = privateKeyToAccount(storedPrivateKey);

        const data = encodeFunctionData({
          abi: POLICY_DELEGATE_ABI,
          functionName: 'revokeSessionKey',
          args: [wallet.address, sessionKeyAddress as Address],
        });

        const hash = await wallet.walletClient.sendTransaction({
          account,
          to: wallet.address,
          data,
          chain: sepolia,
        });

        const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'reverted') {
          return {
            content: [{
              type: 'text' as const,
              text: toJSON({
                success: false,
                error: 'Revoke session key transaction reverted',
                txHash: hash,
              }),
            }],
            isError: true,
          };
        }

        session.revoked = true;

        return {
          content: [{
            type: 'text' as const,
            text: toJSON({
              success: true,
              sessionKeyAddress,
              revoked: true,
              txHash: hash,
              blockNumber: Number(receipt.blockNumber),
              message: 'Session key has been revoked on-chain.',
            }),
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: toJSON({ error: `Revoke session key failed: ${message}` }) }],
          isError: true,
        };
      }
    }

    session.revoked = true;

    return {
      content: [{
        type: 'text' as const,
        text: toJSON({
          success: true,
          sessionKeyAddress,
          revoked: true,
          message: 'Session key has been revoked locally. Set POLICY_DELEGATE_ADDRESS to also revoke on-chain.',
        }),
      }],
    };
  }
);

// ============================================================
// Tool 11: Register Identity (ERC-8004)
// ============================================================

server.tool(
  'clawvault_register_identity',
  'Register the agent on the ERC-8004 Agent Identity Registry. Requires ERC8004_IDENTITY_REGISTRY env var for the on-chain registry contract address.',
  {
    agentName: z.string().describe('Human-readable name for this agent'),
    capabilities: z.array(z.string()).describe('List of agent capabilities (e.g. ["transfer", "swap", "bridge"])'),
  },
  async ({ agentName, capabilities }) => {
    if (!ERC8004_IDENTITY_REGISTRY) {
      return {
        content: [{
          type: 'text' as const,
          text: toJSON({ error: 'ERC-8004 registry address not configured. Set ERC8004_IDENTITY_REGISTRY env var.' }),
        }],
        isError: true,
      };
    }

    let wallet: ReturnType<typeof requireWallet>;
    try {
      wallet = requireWallet();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: message }) }],
        isError: true,
      };
    }

    try {
      const account = privateKeyToAccount(storedPrivateKey!);

      const data = encodeFunctionData({
        abi: ERC8004_ABI,
        functionName: 'registerAgent',
        args: [agentName, capabilities],
      });

      const hash = await wallet.walletClient.sendTransaction({
        account,
        to: ERC8004_IDENTITY_REGISTRY,
        data,
        chain: sepolia,
      });

      const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'reverted') {
        return {
          content: [{
            type: 'text' as const,
            text: toJSON({
              success: false,
              error: 'Identity registration transaction reverted',
              txHash: hash,
            }),
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: toJSON({
            success: true,
            registry: 'ERC-8004 Agent Identity Registry',
            registryAddress: ERC8004_IDENTITY_REGISTRY,
            agentName,
            capabilities,
            owner: wallet.address,
            txHash: hash,
            blockNumber: Number(receipt.blockNumber),
          }, 2),
        }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: toJSON({ error: `Identity registration failed: ${message}` }) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Main -- stdio transport
// ============================================================

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[ClawVault MCP] Server running on stdio');
  console.error(`[ClawVault MCP] RPC: ${PROVIDER_URL}`);
  console.error(`[ClawVault MCP] PolicyDelegate: ${POLICY_DELEGATE_ADDRESS ?? 'not configured'}`);
  console.error(`[ClawVault MCP] ERC-8004 Registry: ${ERC8004_IDENTITY_REGISTRY ?? 'not configured'}`);
  console.error(`[ClawVault MCP] Default USDT: ${SEPOLIA_USDT}`);
}

main().catch(console.error);
