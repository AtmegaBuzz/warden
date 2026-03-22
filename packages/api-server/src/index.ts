import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import express from 'express';
import cors from 'cors';
import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, formatEther, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { PolicyEngine, AuditLogger } from '@aspect-warden/policy-engine';
import type { AgentPolicy, PolicyDecision, AuditEntry } from '@aspect-warden/policy-engine';

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

interface AgentRuntime {
  engine: PolicyEngine;
  logger: AuditLogger;
  sessionKeyRevoked: boolean;
  frozen: boolean;
}

const USDT_ADDRESS = (process.env.SEPOLIA_USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06').toLowerCase();
const USDT_DECIMALS = 6;
const API_PORT = parseInt(process.env.API_PORT || '3001', 10);

function usdtUnits(amount: number): bigint {
  return BigInt(amount) * BigInt(10 ** USDT_DECIMALS);
}

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
  const profiles = [
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

    agents.set(p.id, {
      engine: new PolicyEngine(policy),
      logger: new AuditLogger(),
      sessionKeyRevoked: false,
      frozen: false,
    });
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

app.get('/api/agents', (_req, res) => {
  res.json(Array.from(agents.keys()));
});

app.get('/api/stats', (req, res) => {
  const agentId = req.query.agentId as string | undefined;

  if (agentId) {
    const agent = agents.get(agentId);
    if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }
    res.json(agent.logger.getStats(agentId));
    return;
  }

  let total = 0, approved = 0, blocked = 0;
  const reasonCounts = new Map<string, number>();
  for (const agent of agents.values()) {
    const stats = agent.logger.getStats();
    total += stats.total; approved += stats.approved; blocked += stats.blocked;
    for (const r of stats.topBlockReasons) {
      reasonCounts.set(r.rule, (reasonCounts.get(r.rule) ?? 0) + r.count);
    }
  }
  res.json({
    total, approved, blocked,
    topBlockReasons: Array.from(reasonCounts.entries())
      .map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count),
  });
});

app.get('/api/audit', (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const agentId = req.query.agentId as string | undefined;
  const approvedParam = req.query.approved as string | undefined;
  let approvedFilter: boolean | undefined;
  if (approvedParam === 'true') approvedFilter = true;
  else if (approvedParam === 'false') approvedFilter = false;

  if (agentId) {
    const agent = agents.get(agentId);
    if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }
    const entries = agent.logger.getEntries({ agentId, approved: approvedFilter, limit });
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(entries, bigintReplacer));
    return;
  }

  const allEntries: AuditEntry[] = [];
  for (const agent of agents.values()) {
    allEntries.push(...agent.logger.getEntries({ approved: approvedFilter }));
  }
  allEntries.sort((a, b) => b.timestamp - a.timestamp);
  res.set('Content-Type', 'application/json');
  res.send(JSON.stringify(allEntries.slice(0, limit), bigintReplacer));
});

app.post('/api/freeze', (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }
  agent.frozen = true;
  console.log(`[ACTION] Agent ${agentId} frozen`);
  res.json({ success: true });
});

app.post('/api/unfreeze', (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }
  agent.frozen = false;
  console.log(`[ACTION] Agent ${agentId} unfrozen`);
  res.json({ success: true });
});

app.post('/api/revoke-session-key', (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }
  agent.sessionKeyRevoked = true;
  console.log(`[ACTION] Session key revoked for agent ${agentId}`);
  res.json({ success: true });
});

app.post('/api/policy', (req, res) => {
  const { agentId, ...updates } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }

  const policyUpdates: Partial<AgentPolicy> = {};
  if (updates.maxPerTx !== undefined) policyUpdates.maxPerTx = usdtUnits(updates.maxPerTx);
  if (updates.dailyLimit !== undefined) policyUpdates.dailyLimit = usdtUnits(updates.dailyLimit);
  if (updates.cooldownMs !== undefined) policyUpdates.cooldownMs = updates.cooldownMs;

  agent.engine.updatePolicy(policyUpdates);
  console.log(`[ACTION] Policy updated for agent ${agentId}:`, updates);
  res.json({ success: true, policy: JSON.parse(JSON.stringify(agent.engine.getPolicy(), bigintReplacer)) });
});

app.post('/api/simulate', (req, res) => {
  const { agentId, amount, recipient } = req.body;
  if (!agentId || amount === undefined || !recipient) {
    res.status(400).json({ error: 'agentId, amount, and recipient are required' }); return;
  }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }

  if (agent.frozen) {
    const frozenDecision: PolicyDecision = {
      approved: false, reason: 'Agent is frozen — all transactions blocked',
      ruleTriggered: 'frozen', timestamp: Date.now(), agentId,
      transactionDetails: { to: recipient, value: usdtUnits(amount), token: USDT_ADDRESS, chain: 'ethereum' },
    };
    agent.logger.log(frozenDecision);
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(frozenDecision, bigintReplacer));
    return;
  }

  const value = usdtUnits(amount);
  const decision = agent.engine.evaluate(recipient, value, USDT_ADDRESS, 'ethereum');
  agent.logger.log(decision);
  if (decision.approved) agent.engine.recordTransaction(value, recipient);

  res.set('Content-Type', 'application/json');
  res.send(JSON.stringify(decision, bigintReplacer));
});

app.get('/api/wallet-info', async (req, res) => {
  const address = req.query.address as string;
  if (!address) { res.status(400).json({ error: 'address required' }); return; }
  try {
    const [ethBalance, usdtBalance] = await Promise.all([
      publicClient.getBalance({ address: address as `0x${string}` }),
      publicClient.readContract({
        address: USDT_CONTRACT as `0x${string}`, abi: erc20Abi,
        functionName: 'balanceOf', args: [address as `0x${string}`],
      }),
    ]);
    res.json({
      address, ethBalance: formatEther(ethBalance), usdtBalance: formatUnits(usdtBalance, 6),
      network: 'sepolia', usdtContract: USDT_CONTRACT, policyDelegate: POLICY_DELEGATE || null,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
  }
});

app.get('/api/contract-info', async (_req, res) => {
  if (!POLICY_DELEGATE) { res.json({ deployed: false, message: 'POLICY_DELEGATE_ADDRESS not set' }); return; }
  try {
    const code = await publicClient.getCode({ address: POLICY_DELEGATE as `0x${string}` });
    res.json({
      deployed: code !== undefined && code !== '0x',
      address: POLICY_DELEGATE, network: 'sepolia',
      etherscan: `https://sepolia.etherscan.io/address/${POLICY_DELEGATE}`,
      usdtAddress: USDT_CONTRACT,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
  }
});

app.get('/api/faucet-info', (_req, res) => {
  res.json({
    method: '_giveMeATokens(uint256)', contract: USDT_CONTRACT,
    maxPerCall: '1000 USDT',
    etherscanWrite: `https://sepolia.etherscan.io/address/${USDT_CONTRACT}#writeContract`,
  });
});

// ---------------------------------------------------------------------------
// Real on-chain transfer
// ---------------------------------------------------------------------------

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

app.post('/api/execute-transfer', async (req, res) => {
  const { agentId, amount, recipient } = req.body;
  if (!agentId || amount === undefined || !recipient) {
    res.status(400).json({ error: 'agentId, amount, and recipient required' }); return;
  }
  if (!DEPLOYER_KEY) { res.status(500).json({ error: 'DEPLOYER_PRIVATE_KEY not configured' }); return; }

  const runtime = agents.get(agentId);
  if (!runtime) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }

  const value = usdtUnits(amount);
  const decision = runtime.engine.evaluate(recipient, value, USDT_CONTRACT, 'ethereum');

  if (!decision.approved) {
    runtime.logger.log(decision);
    res.json(JSON.parse(JSON.stringify({ ...decision, onChain: false, txHash: null }, bigintReplacer)));
    return;
  }

  try {
    const account = privateKeyToAccount(`0x${DEPLOYER_KEY}` as `0x${string}`);
    const walletClient = createWalletClient({
      account, chain: sepolia, transport: http(RPC_URL, { timeout: 30000 }),
    });

    const data = encodeFunctionData({
      abi: transferAbi, functionName: 'transfer',
      args: [getAddress(recipient), value],
    });

    const hash = await walletClient.sendTransaction({
      to: USDT_CONTRACT as `0x${string}`, data, chain: sepolia,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    runtime.engine.recordTransaction(value, recipient);
    runtime.logger.log(decision);

    res.json(JSON.parse(JSON.stringify({
      ...decision, onChain: true, txHash: hash,
      blockNumber: Number(receipt.blockNumber), gasUsed: receipt.gasUsed.toString(),
      etherscanUrl: `https://sepolia.etherscan.io/tx/${hash}`,
    }, bigintReplacer)));
  } catch (e: unknown) {
    const err = e as Error & { shortMessage?: string };
    runtime.engine.recordTransaction(value, recipient);
    runtime.logger.log(decision);
    res.status(500).json({
      ...JSON.parse(JSON.stringify(decision, bigintReplacer)),
      onChain: false, txHash: null, chainError: err.shortMessage || err.message?.slice(0, 200),
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
  console.log(`[Warden API] Server running on port ${API_PORT}`);
  console.log(`[Warden API] Agents: ${agentIds}`);
  console.log(`[Warden API] POST /api/simulate { agentId, amount, recipient } to test policy enforcement`);
});
