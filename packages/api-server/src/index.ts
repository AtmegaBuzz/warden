import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import express from 'express';
import cors from 'cors';
import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, formatEther, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { PolicyEngine, AuditLogger, EIP7702Manager } from '@aspect-warden/policy-engine';
import type { AgentPolicy, PolicyDecision, AuditEntry } from '@aspect-warden/policy-engine';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const USDT_ADDRESS = (process.env.SEPOLIA_USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06').toLowerCase();
const USDT_DECIMALS = 6;
const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
const RPC_URL = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const USDT_CONTRACT = process.env.SEPOLIA_USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const POLICY_DELEGATE = process.env.POLICY_DELEGATE_ADDRESS || '';
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || '';

// Agent wallet addresses (from .env)
const AGENT_ADDRESSES: Record<string, string> = {
  'agent-conservative': process.env.AGENT_1_ADDRESS || '',
  'agent-moderate': process.env.AGENT_2_ADDRESS || '',
  'agent-aggressive': process.env.AGENT_3_ADDRESS || '',
};

function usdtUnits(amount: number): bigint {
  return BigInt(amount) * BigInt(10 ** USDT_DECIMALS);
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

const isLiveMode = !!(DEPLOYER_KEY && POLICY_DELEGATE);

// ---------------------------------------------------------------------------
// Blockchain clients
// ---------------------------------------------------------------------------

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
// EIP-7702 Manager (real on-chain operations)
// ---------------------------------------------------------------------------

let eip7702: EIP7702Manager | null = null;

if (isLiveMode) {
  eip7702 = new EIP7702Manager({
    providerUrl: RPC_URL,
    policyDelegateAddress: POLICY_DELEGATE as `0x${string}`,
    privateKey: `0x${DEPLOYER_KEY}` as `0x${string}`,
  });
  console.log('[Warden API] Live mode — EIP-7702 manager initialized');
  console.log(`[Warden API] PolicyDelegate: ${POLICY_DELEGATE}`);
} else {
  console.log('[Warden API] Simulated mode — no DEPLOYER_PRIVATE_KEY or POLICY_DELEGATE_ADDRESS');
}

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

interface AgentRuntime {
  engine: PolicyEngine;
  logger: AuditLogger;
  sessionKeyRevoked: boolean;
  frozen: boolean;
  walletAddress: string;
}

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
      walletAddress: AGENT_ADDRESSES[p.id] || '',
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers: on-chain queries
// ---------------------------------------------------------------------------

async function getAgentBalance(address: string): Promise<{ eth: string; usdt: string } | null> {
  if (!address) return null;
  try {
    const [ethBal, usdtBal] = await Promise.all([
      publicClient.getBalance({ address: address as `0x${string}` }),
      publicClient.readContract({
        address: USDT_CONTRACT as `0x${string}`, abi: erc20Abi,
        functionName: 'balanceOf', args: [address as `0x${string}`],
      }),
    ]);
    return { eth: formatEther(ethBal), usdt: formatUnits(usdtBal, 6) };
  } catch {
    return null;
  }
}

async function getOnChainSessionKeyState(agentAddress: string) {
  if (!eip7702 || !agentAddress) return null;
  try {
    const [valid, budget] = await Promise.all([
      eip7702.isSessionKeyValid(agentAddress as `0x${string}`),
      eip7702.getRemainingBudget(agentAddress as `0x${string}`),
    ]);
    return { valid, remainingBudget: budget.toString(), remainingBudgetUsdt: formatUnits(budget, 6) };
  } catch {
    return null;
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

// -- GET /api/mode -----------------------------------------------------------

app.get('/api/mode', (_req, res) => {
  res.json({
    mode: isLiveMode ? 'live' : 'simulated',
    rpcUrl: RPC_URL,
    policyDelegate: POLICY_DELEGATE || null,
    network: 'sepolia',
  });
});

// -- GET /api/agents (enhanced with balances) --------------------------------

app.get('/api/agents', async (_req, res) => {
  const result = [];
  for (const [id, agent] of agents.entries()) {
    const balance = agent.walletAddress ? await getAgentBalance(agent.walletAddress) : null;
    const onChain = agent.walletAddress ? await getOnChainSessionKeyState(agent.walletAddress) : null;
    const spending = agent.engine.getSpendingStatus();

    result.push({
      id,
      walletAddress: agent.walletAddress || null,
      frozen: agent.frozen,
      sessionKeyRevoked: agent.sessionKeyRevoked,
      balance,
      onChainState: onChain,
      spending: JSON.parse(JSON.stringify(spending, bigintReplacer)),
      policy: JSON.parse(JSON.stringify(agent.engine.getPolicy(), bigintReplacer)),
    });
  }
  res.json(result);
});

// -- GET /api/stats ----------------------------------------------------------

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

// -- GET /api/audit ----------------------------------------------------------

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

// -- POST /api/freeze (on-chain if live) -------------------------------------

app.post('/api/freeze', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }

  let txHash: string | null = null;
  if (eip7702) {
    try {
      txHash = await eip7702.freeze();
      console.log(`[ACTION] Agent ${agentId} frozen ON-CHAIN: ${txHash}`);
    } catch (e: unknown) {
      console.error(`[ACTION] On-chain freeze failed, falling back to local:`, (e as Error).message);
    }
  }

  agent.frozen = true;
  console.log(`[ACTION] Agent ${agentId} frozen${txHash ? ' (on-chain)' : ' (local only)'}`);
  res.json({ success: true, onChain: !!txHash, txHash });
});

// -- POST /api/unfreeze (on-chain if live) -----------------------------------

app.post('/api/unfreeze', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }

  let txHash: string | null = null;
  if (eip7702) {
    try {
      txHash = await eip7702.unfreeze();
      console.log(`[ACTION] Agent ${agentId} unfrozen ON-CHAIN: ${txHash}`);
    } catch (e: unknown) {
      console.error(`[ACTION] On-chain unfreeze failed, falling back to local:`, (e as Error).message);
    }
  }

  agent.frozen = false;
  console.log(`[ACTION] Agent ${agentId} unfrozen${txHash ? ' (on-chain)' : ' (local only)'}`);
  res.json({ success: true, onChain: !!txHash, txHash });
});

// -- POST /api/create-session-key (on-chain) ---------------------------------

app.post('/api/create-session-key', async (req, res) => {
  const { agentId, maxPerTx, dailyLimit, validForSeconds, cooldownSeconds } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }
  if (!agent.walletAddress) { res.status(400).json({ error: 'Agent has no wallet address configured' }); return; }
  if (!eip7702) { res.status(500).json({ error: 'Live mode not configured (need DEPLOYER_PRIVATE_KEY + POLICY_DELEGATE_ADDRESS)' }); return; }

  try {
    const txHash = await eip7702.createSessionKey({
      agentAddress: agent.walletAddress as `0x${string}`,
      maxPerTx: usdtUnits(maxPerTx || 100),
      dailyLimit: usdtUnits(dailyLimit || 500),
      validForSeconds: validForSeconds || 86400,
      cooldownSeconds: cooldownSeconds || 60,
    });
    agent.sessionKeyRevoked = false;
    res.json({ success: true, txHash, agentAddress: agent.walletAddress });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message?.slice(0, 300) });
  }
});

// -- POST /api/revoke-session-key (on-chain if live) -------------------------

app.post('/api/revoke-session-key', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId is required' }); return; }
  const agent = agents.get(agentId);
  if (!agent) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }

  let txHash: string | null = null;
  if (eip7702 && agent.walletAddress) {
    try {
      txHash = await eip7702.revokeSessionKey(agent.walletAddress as `0x${string}`);
      console.log(`[ACTION] Session key revoked ON-CHAIN for ${agentId}: ${txHash}`);
    } catch (e: unknown) {
      console.error(`[ACTION] On-chain revoke failed:`, (e as Error).message);
    }
  }

  agent.sessionKeyRevoked = true;
  res.json({ success: true, onChain: !!txHash, txHash });
});

// -- GET /api/session-keys (on-chain read) -----------------------------------

app.get('/api/session-keys', async (_req, res) => {
  if (!eip7702) { res.json({ live: false, keys: [] }); return; }

  try {
    const keyList = await eip7702.getSessionKeyList();
    const keys = await Promise.all(keyList.map(async (addr) => {
      const [valid, budget] = await Promise.all([
        eip7702!.isSessionKeyValid(addr),
        eip7702!.getRemainingBudget(addr),
      ]);
      return { address: addr, valid, remainingBudget: formatUnits(budget, 6) };
    }));
    res.json({ live: true, keys });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
  }
});

// -- GET /api/agent/:id/on-chain-status --------------------------------------

app.get('/api/agent/:id/on-chain-status', async (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const balance = agent.walletAddress ? await getAgentBalance(agent.walletAddress) : null;
  const onChain = agent.walletAddress ? await getOnChainSessionKeyState(agent.walletAddress) : null;

  let contractPolicy = null;
  if (eip7702) {
    try { contractPolicy = await eip7702.getPolicy(); } catch {}
  }

  res.json({
    id: req.params.id,
    walletAddress: agent.walletAddress || null,
    mode: isLiveMode ? 'live' : 'simulated',
    balance,
    onChainState: onChain,
    contractPolicy: contractPolicy ? JSON.parse(JSON.stringify(contractPolicy, bigintReplacer)) : null,
    localPolicy: JSON.parse(JSON.stringify(agent.engine.getPolicy(), bigintReplacer)),
    spending: JSON.parse(JSON.stringify(agent.engine.getSpendingStatus(), bigintReplacer)),
  });
});

// -- POST /api/policy --------------------------------------------------------

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
  res.json({ success: true, policy: JSON.parse(JSON.stringify(agent.engine.getPolicy(), bigintReplacer)) });
});

// -- POST /api/simulate (with optional on-chain validation) ------------------

app.post('/api/simulate', async (req, res) => {
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

  // On-chain double-check if live
  let onChainApproved: boolean | null = null;
  if (eip7702 && agent.walletAddress && decision.approved) {
    try {
      onChainApproved = await eip7702.validateOnChain(
        agent.walletAddress as `0x${string}`,
        recipient as `0x${string}`,
        value,
      );
    } catch {
      onChainApproved = null; // RPC error, can't verify
    }
  }

  agent.logger.log(decision);
  if (decision.approved) agent.engine.recordTransaction(value, recipient);

  res.set('Content-Type', 'application/json');
  res.send(JSON.stringify({ ...decision, onChainApproved }, bigintReplacer));
});

// -- GET /api/wallet-info ----------------------------------------------------

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

// -- GET /api/contract-info --------------------------------------------------

app.get('/api/contract-info', async (_req, res) => {
  if (!POLICY_DELEGATE) { res.json({ deployed: false, message: 'POLICY_DELEGATE_ADDRESS not set' }); return; }
  try {
    const code = await publicClient.getCode({ address: POLICY_DELEGATE as `0x${string}` });
    let version: string | null = null;
    if (eip7702) {
      try { version = await eip7702.getContractVersion(); } catch {}
    }
    res.json({
      deployed: code !== undefined && code !== '0x',
      address: POLICY_DELEGATE, network: 'sepolia', version,
      etherscan: `https://sepolia.etherscan.io/address/${POLICY_DELEGATE}`,
      usdtAddress: USDT_CONTRACT,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
  }
});

// -- GET /api/faucet-info ----------------------------------------------------

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

const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

app.post('/api/execute-transfer', async (req, res) => {
  const { agentId, amount, recipient } = req.body;
  if (!agentId || amount === undefined || !recipient) {
    res.status(400).json({ error: 'agentId, amount, and recipient required' }); return;
  }
  if (!DEPLOYER_KEY) { res.status(500).json({ error: 'DEPLOYER_PRIVATE_KEY not configured' }); return; }

  const runtime = agents.get(agentId);
  if (!runtime) { res.status(404).json({ error: `Agent ${agentId} not found` }); return; }

  if (runtime.frozen) {
    const frozenDecision: PolicyDecision = {
      approved: false, reason: 'Agent is frozen — all transactions blocked',
      ruleTriggered: 'frozen', timestamp: Date.now(), agentId,
      transactionDetails: { to: recipient, value: usdtUnits(amount), token: USDT_CONTRACT, chain: 'ethereum' },
    };
    runtime.logger.log(frozenDecision);
    res.json(JSON.parse(JSON.stringify({ ...frozenDecision, onChain: false, txHash: null }, bigintReplacer)));
    return;
  }

  const value = usdtUnits(amount);
  const decision = runtime.engine.evaluate(recipient, value, USDT_CONTRACT, 'ethereum');

  if (!decision.approved) {
    runtime.logger.log(decision);
    res.json(JSON.parse(JSON.stringify({ ...decision, onChain: false, txHash: null }, bigintReplacer)));
    return;
  }

  // On-chain double-check
  let onChainApproved: boolean | null = null;
  if (eip7702 && runtime.walletAddress) {
    try {
      onChainApproved = await eip7702.validateOnChain(
        runtime.walletAddress as `0x${string}`,
        recipient as `0x${string}`,
        value,
      );
      if (onChainApproved === false) {
        const blocked: PolicyDecision = {
          ...decision, approved: false,
          reason: 'Blocked by on-chain PolicyDelegate (EIP-7702)',
          ruleTriggered: 'onChainPolicy',
        };
        runtime.logger.log(blocked);
        res.json(JSON.parse(JSON.stringify({ ...blocked, onChain: false, txHash: null, onChainApproved: false }, bigintReplacer)));
        return;
      }
    } catch {}
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
      ...decision, onChain: true, txHash: hash, onChainApproved,
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

// -- GET /api/erc8004-status -------------------------------------------------

app.get('/api/erc8004-status', async (_req, res) => {
  const identityRegistry = process.env.ERC8004_IDENTITY_REGISTRY;
  const reputationRegistry = process.env.ERC8004_REPUTATION_REGISTRY;

  if (!identityRegistry || !reputationRegistry) {
    res.json({ configured: false, identityRegistry: identityRegistry || 'not set', reputationRegistry: reputationRegistry || 'not set' });
    return;
  }

  try {
    const [identityCode, reputationCode] = await Promise.all([
      publicClient.getCode({ address: identityRegistry as `0x${string}` }),
      publicClient.getCode({ address: reputationRegistry as `0x${string}` }),
    ]);
    res.json({
      configured: true,
      identityRegistry: { address: identityRegistry, deployed: identityCode !== undefined && identityCode !== '0x', etherscan: `https://sepolia.etherscan.io/address/${identityRegistry}` },
      reputationRegistry: { address: reputationRegistry, deployed: reputationCode !== undefined && reputationCode !== '0x', etherscan: `https://sepolia.etherscan.io/address/${reputationRegistry}` },
      standard: 'ERC-8004',
    });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

createAgents();

app.listen(API_PORT, () => {
  const agentIds = Array.from(agents.keys()).join(', ');
  console.log(`[Warden API] Server running on port ${API_PORT}`);
  console.log(`[Warden API] Mode: ${isLiveMode ? 'LIVE (Sepolia)' : 'SIMULATED'}`);
  console.log(`[Warden API] Agents: ${agentIds}`);
  if (isLiveMode) {
    console.log(`[Warden API] PolicyDelegate: ${POLICY_DELEGATE}`);
    console.log(`[Warden API] Deployer: ${privateKeyToAccount(`0x${DEPLOYER_KEY}` as `0x${string}`).address}`);
  }
});
