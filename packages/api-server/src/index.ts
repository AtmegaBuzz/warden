import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import express from 'express';
import cors from 'cors';
import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, formatEther, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// ---------------------------------------------------------------------------
// Inlined types (mirrors @clawvault/policy-engine without the import)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Inlined PolicyEngine
// ---------------------------------------------------------------------------

class PolicyEngine {
  private policy: AgentPolicy;
  private tracker: SpendingTracker;
  private frozen = false;

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

  isFrozen(): boolean {
    return this.frozen;
  }

  freeze(): void {
    this.frozen = true;
  }

  unfreeze(): void {
    this.frozen = false;
  }

  evaluate(to: string, value: bigint, token?: string, chain?: string): PolicyDecision {
    const base = {
      timestamp: Date.now(),
      agentId: this.policy.agentId,
      transactionDetails: { to, value, token, chain: chain || 'ethereum' },
    };

    if (this.frozen) {
      return {
        ...base, approved: false,
        reason: 'Agent is frozen — all transactions blocked',
        ruleTriggered: 'frozen',
      };
    }

    // Rule 1: maxPerTx
    if (value > this.policy.maxPerTx) {
      return {
        ...base, approved: false,
        reason: `Amount ${value} exceeds per-transaction limit of ${this.policy.maxPerTx}`,
        ruleTriggered: 'maxPerTx',
      };
    }

    // Rule 2: dailyLimit (24h rolling window)
    this.resetWindowIfExpired();
    if (this.tracker.spent + value > this.policy.dailyLimit) {
      return {
        ...base, approved: false,
        reason: `Daily spending would reach ${this.tracker.spent + value}, exceeding limit of ${this.policy.dailyLimit}`,
        ruleTriggered: 'dailyLimit',
      };
    }

    // Rule 3: cooldown
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

    // Rule 4: blockedTokens
    if (token && this.policy.blockedTokens.length > 0 && this.policy.blockedTokens.includes(token.toLowerCase())) {
      return {
        ...base, approved: false,
        reason: `Token ${token} is blocked`,
        ruleTriggered: 'blockedToken',
      };
    }

    // Rule 5: allowedTokens
    if (token && this.policy.allowedTokens.length > 0 && !this.policy.allowedTokens.includes(token.toLowerCase())) {
      return {
        ...base, approved: false,
        reason: `Token ${token} not in allowed list`,
        ruleTriggered: 'allowedTokens',
      };
    }

    // Rule 6: blockedRecipients
    const toLower = to.toLowerCase();
    if (this.policy.blockedRecipients.length > 0 && this.policy.blockedRecipients.includes(toLower)) {
      return {
        ...base, approved: false,
        reason: `Recipient ${to} is blocked`,
        ruleTriggered: 'blockedRecipient',
      };
    }

    // Rule 7: allowedRecipients
    if (this.policy.allowedRecipients.length > 0 && !this.policy.allowedRecipients.includes(toLower)) {
      return {
        ...base, approved: false,
        reason: `Recipient ${to} not in allowed list`,
        ruleTriggered: 'allowedRecipients',
      };
    }

    // Rule 8: allowedChains
    if (chain && this.policy.allowedChains.length > 0 && !this.policy.allowedChains.includes(chain)) {
      return {
        ...base, approved: false,
        reason: `Chain ${chain} not allowed`,
        ruleTriggered: 'allowedChains',
      };
    }

    // Rule 9: anomalyDetection
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

    // Rule 10: requireApproval
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
    const oneHourAgo = Date.now() - 3_600_000;

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
      if (elapsed < 60_000) score += 15;
      else if (elapsed < 300_000) score += 5;
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
      windowResets: this.tracker.windowStart + 86_400_000,
    };
  }

  updatePolicy(updates: Partial<AgentPolicy>): void {
    Object.assign(this.policy, updates);
  }

  getPolicy(): AgentPolicy {
    return { ...this.policy };
  }

  private resetWindowIfExpired(): void {
    const now = Date.now();
    if (now > this.tracker.windowStart + 86_400_000) {
      this.tracker.spent = 0n;
      this.tracker.windowStart = now;
    }
  }
}

// ---------------------------------------------------------------------------
// Inlined AuditLogger
// ---------------------------------------------------------------------------

class AuditLogger {
  private entries: AuditEntry[] = [];
  private maxEntries: number;

  constructor(options?: { maxEntries?: number }) {
    this.maxEntries = options?.maxEntries ?? 10_000;
  }

  log(decision: PolicyDecision): void {
    const entry: AuditEntry = { ...decision };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    const status = entry.approved ? 'APPROVED' : 'BLOCKED';
    console.log(
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

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

interface AgentRuntime {
  engine: PolicyEngine;
  logger: AuditLogger;
  sessionKeyRevoked: boolean;
}

const USDT_ADDRESS = (process.env.SEPOLIA_USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06').toLowerCase();
const USDT_DECIMALS = 6;
const API_PORT = parseInt(process.env.API_PORT || '3001', 10);

function usdtUnits(amount: number): bigint {
  return BigInt(amount) * BigInt(10 ** USDT_DECIMALS);
}

// BigInt JSON replacer — converts bigint to string for wire format
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

// ---------------------------------------------------------------------------
// Blockchain client (Sepolia via viem)
// ---------------------------------------------------------------------------

const RPC_URL = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const USDT_CONTRACT = (process.env.SEPOLIA_USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06');
const POLICY_DELEGATE = process.env.POLICY_DELEGATE_ADDRESS || '';

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL, { timeout: 15000 }),
});

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

// ---------------------------------------------------------------------------
// Agent registry & initialization
// ---------------------------------------------------------------------------

const agents = new Map<string, AgentRuntime>();

function createAgents(): void {
  const profiles: Array<{
    id: string;
    maxPerTx: number;
    dailyLimit: number;
    requireApprovalAbove: number;
    cooldownMs: number;
    anomaly: { maxTxPerHour: number; maxRecipientsPerHour: number; largeTransactionPct: number };
  }> = [
    {
      id: 'agent-conservative',
      maxPerTx: 10, dailyLimit: 50, requireApprovalAbove: 8, cooldownMs: 60_000,
      anomaly: { maxTxPerHour: 5, maxRecipientsPerHour: 3, largeTransactionPct: 40 },
    },
    {
      id: 'agent-moderate',
      maxPerTx: 50, dailyLimit: 200, requireApprovalAbove: 40, cooldownMs: 30_000,
      anomaly: { maxTxPerHour: 10, maxRecipientsPerHour: 5, largeTransactionPct: 50 },
    },
    {
      id: 'agent-aggressive',
      maxPerTx: 200, dailyLimit: 1000, requireApprovalAbove: 150, cooldownMs: 10_000,
      anomaly: { maxTxPerHour: 20, maxRecipientsPerHour: 10, largeTransactionPct: 60 },
    },
  ];

  for (const p of profiles) {
    const policy: AgentPolicy = {
      agentId: p.id,
      maxPerTx: usdtUnits(p.maxPerTx),
      dailyLimit: usdtUnits(p.dailyLimit),
      requireApprovalAbove: usdtUnits(p.requireApprovalAbove),
      allowedTokens: [USDT_ADDRESS],
      blockedTokens: [],
      allowedRecipients: [],
      blockedRecipients: [],
      allowedChains: ['ethereum'],
      cooldownMs: p.cooldownMs,
      anomalyDetection: p.anomaly,
    };

    const engine = new PolicyEngine(policy);
    const logger = new AuditLogger();

    agents.set(p.id, { engine, logger, sessionKeyRevoked: false });
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// -- GET /api/agents --------------------------------------------------------

app.get('/api/agents', (_req, res) => {
  res.json(Array.from(agents.keys()));
});

// -- GET /api/stats ---------------------------------------------------------

app.get('/api/stats', (req, res) => {
  const agentId = req.query.agentId as string | undefined;

  if (agentId) {
    const agent = agents.get(agentId);
    if (!agent) {
      res.status(404).json({ error: `Agent ${agentId} not found` });
      return;
    }
    res.json(agent.logger.getStats(agentId));
    return;
  }

  // Aggregate across all agents
  let total = 0;
  let approved = 0;
  let blocked = 0;
  const reasonCounts = new Map<string, number>();

  for (const agent of agents.values()) {
    const stats = agent.logger.getStats();
    total += stats.total;
    approved += stats.approved;
    blocked += stats.blocked;
    for (const r of stats.topBlockReasons) {
      reasonCounts.set(r.rule, (reasonCounts.get(r.rule) ?? 0) + r.count);
    }
  }

  res.json({
    total,
    approved,
    blocked,
    topBlockReasons: Array.from(reasonCounts.entries())
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count),
  });
});

// -- GET /api/audit ---------------------------------------------------------

app.get('/api/audit', (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const agentId = req.query.agentId as string | undefined;
  const approvedParam = req.query.approved as string | undefined;

  let approvedFilter: boolean | undefined;
  if (approvedParam === 'true') approvedFilter = true;
  else if (approvedParam === 'false') approvedFilter = false;

  if (agentId) {
    const agent = agents.get(agentId);
    if (!agent) {
      res.status(404).json({ error: `Agent ${agentId} not found` });
      return;
    }
    const entries = agent.logger.getEntries({ agentId, approved: approvedFilter, limit });
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(entries, bigintReplacer));
    return;
  }

  // Merge entries from all agents, sort descending by timestamp
  const allEntries: AuditEntry[] = [];
  for (const agent of agents.values()) {
    allEntries.push(...agent.logger.getEntries({ approved: approvedFilter }));
  }
  allEntries.sort((a, b) => b.timestamp - a.timestamp);
  const limited = allEntries.slice(0, limit);

  res.set('Content-Type', 'application/json');
  res.send(JSON.stringify(limited, bigintReplacer));
});

// -- POST /api/freeze -------------------------------------------------------

app.post('/api/freeze', (req, res) => {
  const { agentId } = req.body as { agentId?: string };
  if (!agentId) {
    res.status(400).json({ error: 'agentId is required' });
    return;
  }
  const agent = agents.get(agentId);
  if (!agent) {
    res.status(404).json({ error: `Agent ${agentId} not found` });
    return;
  }
  agent.engine.freeze();
  console.log(`[ACTION] Agent ${agentId} frozen`);
  res.json({ success: true });
});

// -- POST /api/unfreeze -----------------------------------------------------

app.post('/api/unfreeze', (req, res) => {
  const { agentId } = req.body as { agentId?: string };
  if (!agentId) {
    res.status(400).json({ error: 'agentId is required' });
    return;
  }
  const agent = agents.get(agentId);
  if (!agent) {
    res.status(404).json({ error: `Agent ${agentId} not found` });
    return;
  }
  agent.engine.unfreeze();
  console.log(`[ACTION] Agent ${agentId} unfrozen`);
  res.json({ success: true });
});

// -- POST /api/revoke-session-key -------------------------------------------

app.post('/api/revoke-session-key', (req, res) => {
  const { agentId } = req.body as { agentId?: string };
  if (!agentId) {
    res.status(400).json({ error: 'agentId is required' });
    return;
  }
  const agent = agents.get(agentId);
  if (!agent) {
    res.status(404).json({ error: `Agent ${agentId} not found` });
    return;
  }
  agent.sessionKeyRevoked = true;
  console.log(`[ACTION] Session key revoked for agent ${agentId}`);
  res.json({ success: true });
});

// -- POST /api/policy -------------------------------------------------------

app.post('/api/policy', (req, res) => {
  const { agentId, ...updates } = req.body as {
    agentId?: string;
    maxPerTx?: number;
    dailyLimit?: number;
    cooldownMs?: number;
  };
  if (!agentId) {
    res.status(400).json({ error: 'agentId is required' });
    return;
  }
  const agent = agents.get(agentId);
  if (!agent) {
    res.status(404).json({ error: `Agent ${agentId} not found` });
    return;
  }

  const policyUpdates: Partial<AgentPolicy> = {};
  if (updates.maxPerTx !== undefined) policyUpdates.maxPerTx = usdtUnits(updates.maxPerTx);
  if (updates.dailyLimit !== undefined) policyUpdates.dailyLimit = usdtUnits(updates.dailyLimit);
  if (updates.cooldownMs !== undefined) policyUpdates.cooldownMs = updates.cooldownMs;

  agent.engine.updatePolicy(policyUpdates);
  console.log(`[ACTION] Policy updated for agent ${agentId}:`, updates);
  res.json({ success: true, policy: JSON.parse(JSON.stringify(agent.engine.getPolicy(), bigintReplacer)) });
});

// -- POST /api/simulate -----------------------------------------------------

app.post('/api/simulate', (req, res) => {
  const { agentId, amount, recipient } = req.body as {
    agentId?: string;
    amount?: number;
    recipient?: string;
  };
  if (!agentId || amount === undefined || !recipient) {
    res.status(400).json({ error: 'agentId, amount, and recipient are required' });
    return;
  }
  const agent = agents.get(agentId);
  if (!agent) {
    res.status(404).json({ error: `Agent ${agentId} not found` });
    return;
  }

  const to = recipient;
  const value = usdtUnits(amount);
  const decision = agent.engine.evaluate(to, value, USDT_ADDRESS, 'ethereum');

  agent.logger.log(decision);
  if (decision.approved) {
    agent.engine.recordTransaction(value, to);
  }

  res.set('Content-Type', 'application/json');
  res.send(JSON.stringify(decision, bigintReplacer));
});

// -- GET /api/wallet-info ---------------------------------------------------

app.get('/api/wallet-info', async (req, res) => {
  const address = req.query.address as string;
  if (!address) {
    res.status(400).json({ error: 'address required' });
    return;
  }

  try {
    const [ethBalance, usdtBalance] = await Promise.all([
      publicClient.getBalance({ address: address as `0x${string}` }),
      publicClient.readContract({
        address: USDT_CONTRACT as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      }),
    ]);

    res.json({
      address,
      ethBalance: formatEther(ethBalance),
      usdtBalance: formatUnits(usdtBalance, 6),
      network: 'sepolia',
      usdtContract: USDT_CONTRACT,
      policyDelegate: POLICY_DELEGATE || null,
    });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ error: err.message?.slice(0, 200) });
  }
});

// -- GET /api/contract-info -------------------------------------------------

app.get('/api/contract-info', async (_req, res) => {
  if (!POLICY_DELEGATE) {
    res.json({ deployed: false, message: 'POLICY_DELEGATE_ADDRESS not set' });
    return;
  }

  try {
    const code = await publicClient.getCode({ address: POLICY_DELEGATE as `0x${string}` });
    const hasCode = code !== undefined && code !== '0x';

    res.json({
      deployed: hasCode,
      address: POLICY_DELEGATE,
      network: 'sepolia',
      etherscan: `https://sepolia.etherscan.io/address/${POLICY_DELEGATE}`,
      usdtAddress: USDT_CONTRACT,
      usdtEtherscan: `https://sepolia.etherscan.io/token/${USDT_CONTRACT}`,
    });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ error: err.message?.slice(0, 200) });
  }
});

// -- GET /api/faucet-info ---------------------------------------------------

app.get('/api/faucet-info', (_req, res) => {
  res.json({
    method: '_giveMeATokens(uint256)',
    contract: USDT_CONTRACT,
    maxPerCall: '1000 USDT',
    note: 'Call _giveMeATokens(1000000000) on the USDT contract to get 1000 test USDT',
    etherscanWrite: `https://sepolia.etherscan.io/address/${USDT_CONTRACT}#writeContract`,
  });
});

// ---------------------------------------------------------------------------
// Real on-chain transfer endpoint
// ---------------------------------------------------------------------------

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const transferAbi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

app.post('/api/execute-transfer', async (req, res) => {
  const { agentId, amount, recipient } = req.body;
  if (!agentId || amount === undefined || !recipient) {
    res.status(400).json({ error: 'agentId, amount, and recipient required' });
    return;
  }
  if (!DEPLOYER_KEY) {
    res.status(500).json({ error: 'DEPLOYER_PRIVATE_KEY not configured' });
    return;
  }

  const runtime = agents.get(agentId);
  if (!runtime) {
    res.status(404).json({ error: `Agent ${agentId} not found` });
    return;
  }

  const value = usdtUnits(amount);

  // Step 1: Evaluate against PolicyEngine
  const decision = runtime.engine.evaluate(
    recipient,
    value,
    USDT_CONTRACT,
    'ethereum'
  );

  // Step 2: If blocked, log and return
  if (!decision.approved) {
    runtime.logger.log(decision);
    res.json(JSON.parse(JSON.stringify({
      ...decision,
      onChain: false,
      txHash: null,
      etherscanUrl: null,
    }, bigintReplacer)));
    return;
  }

  // Step 3: If approved, send REAL USDT transfer on Sepolia
  try {
    const account = privateKeyToAccount(`0x${DEPLOYER_KEY}` as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(RPC_URL, { timeout: 30000 }),
    });

    const checksummedRecipient = getAddress(recipient as string);

    const data = encodeFunctionData({
      abi: transferAbi,
      functionName: 'transfer',
      args: [checksummedRecipient, value],
    });

    const hash = await walletClient.sendTransaction({
      to: USDT_CONTRACT as `0x${string}`,
      data,
      chain: sepolia,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Record in policy engine
    runtime.engine.recordTransaction(value, recipient);

    // Log the approved decision
    runtime.logger.log(decision);

    res.json(JSON.parse(JSON.stringify({
      ...decision,
      onChain: true,
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
      etherscanUrl: `https://sepolia.etherscan.io/tx/${hash}`,
    }, bigintReplacer)));
  } catch (e: unknown) {
    const err = e as Error & { shortMessage?: string };
    // Still log the decision as approved (policy passed, chain failed)
    runtime.engine.recordTransaction(value, recipient);
    runtime.logger.log(decision);

    res.status(500).json({
      ...JSON.parse(JSON.stringify(decision, bigintReplacer)),
      onChain: false,
      txHash: null,
      chainError: err.shortMessage || err.message?.slice(0, 200),
    });
  }
});

// -- GET /api/erc8004-status ------------------------------------------------

app.get('/api/erc8004-status', async (_req, res) => {
  const identityRegistry = process.env.ERC8004_IDENTITY_REGISTRY;
  const reputationRegistry = process.env.ERC8004_REPUTATION_REGISTRY;

  if (!identityRegistry || !reputationRegistry) {
    res.json({
      configured: false,
      identityRegistry: identityRegistry || 'not set',
      reputationRegistry: reputationRegistry || 'not set',
    });
    return;
  }

  try {
    const [identityCode, reputationCode] = await Promise.all([
      publicClient.getCode({ address: identityRegistry as `0x${string}` }),
      publicClient.getCode({ address: reputationRegistry as `0x${string}` }),
    ]);

    res.json({
      configured: true,
      identityRegistry: {
        address: identityRegistry,
        deployed: identityCode !== undefined && identityCode !== '0x',
        etherscan: `https://sepolia.etherscan.io/address/${identityRegistry}`,
      },
      reputationRegistry: {
        address: reputationRegistry,
        deployed: reputationCode !== undefined && reputationCode !== '0x',
        etherscan: `https://sepolia.etherscan.io/address/${reputationRegistry}`,
      },
      standard: 'ERC-8004',
      description: 'Trustless Agents — on-chain identity, reputation, and validation',
    });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ error: err.message?.slice(0, 200) });
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

createAgents();

const agentIds = Array.from(agents.keys()).join(', ');

app.listen(API_PORT, () => {
  console.log(`[ClawVault API] Server running on port ${API_PORT}`);
  console.log(`[ClawVault API] Agents: ${agentIds}`);
  console.log(`[ClawVault API] POST /api/simulate { agentId, amount, recipient } to test policy enforcement`);
});
