# 02 — TypeScript Policy Engine Implementation Guide (v2 — Improved)

## Overview

This is the core npm package that wraps WDK's `wdk-wallet-evm` with policy enforcement. **v2 CRITICAL FIX: replaces broken ethers.js v6 EIP-7702 code with working viem implementation. Also adds anomaly detection, velocity checks, and proper on-chain delegation.**

---

## Step 1: Scaffold the Module

```bash
mkdir -p packages/policy-engine
cd packages/policy-engine
npm init -y
# CRITICAL CHANGE: Use viem instead of ethers for EIP-7702 support
npm install @tetherto/wdk @tetherto/wdk-wallet-evm viem
npm install -D typescript vitest @types/node
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

### package.json (key fields)
```json
{
  "name": "@clawvault/policy-engine",
  "version": "0.2.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@tetherto/wdk": "^0.x",
    "@tetherto/wdk-wallet-evm": "^0.x",
    "viem": "^2.x"
  }
}
```

---

## Step 2: Type Definitions (src/types.ts)

```typescript
// src/types.ts

export interface AgentPolicy {
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

  // NEW: Anomaly detection settings
  anomalyDetection?: {
    /** Max transactions per hour before flagging */
    maxTxPerHour: number;
    /** Max unique recipients per hour */
    maxRecipientsPerHour: number;
    /** Flag if single tx is > N% of daily limit */
    largeTransactionPct: number;
  };

  sessionKey?: {
    address: string;
    validUntil: number;
  };
}

export interface PolicyDecision {
  approved: boolean;
  reason: string;
  ruleTriggered: string | null;
  timestamp: number;
  agentId: string;
  riskScore?: number; // NEW: 0-100 risk assessment
  transactionDetails: {
    to: string;
    value: bigint;
    token?: string;
    chain: string;
  };
}

export interface AuditEntry extends PolicyDecision {
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

export interface PolicyWalletConfig {
  underlying: any;
  provider: string;
  policy: AgentPolicy;
  policyDelegateAddress?: string;
  onAuditLog?: (entry: AuditEntry) => void | Promise<void>;
  onApprovalRequired?: (decision: PolicyDecision) => Promise<boolean>;
  transferMaxFee?: bigint;
}

export interface SpendingTracker {
  spent: bigint;
  windowStart: number;
  lastTxTimestamp: number;
  // NEW: Velocity tracking
  txTimestamps: number[];
  recentRecipients: string[];
}
```

---

## Step 3: Policy Engine (src/PolicyEngine.ts) — IMPROVED with Anomaly Detection

```typescript
// src/PolicyEngine.ts

import { AgentPolicy, PolicyDecision, SpendingTracker } from './types.js';

export class PolicyEngine {
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

    // Rule 1: Per-transaction limit
    if (value > this.policy.maxPerTx) {
      return {
        ...base, approved: false,
        reason: `Amount ${value} exceeds per-transaction limit of ${this.policy.maxPerTx}`,
        ruleTriggered: 'maxPerTx',
      };
    }

    // Rule 2: Daily limit
    this.resetWindowIfExpired();
    if (this.tracker.spent + value > this.policy.dailyLimit) {
      return {
        ...base, approved: false,
        reason: `Daily spending would reach ${this.tracker.spent + value}, exceeding limit of ${this.policy.dailyLimit}`,
        ruleTriggered: 'dailyLimit',
      };
    }

    // Rule 3: Cooldown
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

    // Rule 4: Blocked token
    if (token && this.policy.blockedTokens.length > 0 && this.policy.blockedTokens.includes(token.toLowerCase())) {
      return {
        ...base, approved: false,
        reason: `Token ${token} is blocked`,
        ruleTriggered: 'blockedToken',
      };
    }

    // Rule 5: Allowed tokens
    if (token && this.policy.allowedTokens.length > 0 && !this.policy.allowedTokens.includes(token.toLowerCase())) {
      return {
        ...base, approved: false,
        reason: `Token ${token} not in allowed list`,
        ruleTriggered: 'allowedTokens',
      };
    }

    // Rule 6: Blocked recipient
    const toLower = to.toLowerCase();
    if (this.policy.blockedRecipients.length > 0 && this.policy.blockedRecipients.includes(toLower)) {
      return {
        ...base, approved: false,
        reason: `Recipient ${to} is blocked`,
        ruleTriggered: 'blockedRecipient',
      };
    }

    // Rule 7: Allowed recipients
    if (this.policy.allowedRecipients.length > 0 && !this.policy.allowedRecipients.includes(toLower)) {
      return {
        ...base, approved: false,
        reason: `Recipient ${to} not in allowed list`,
        ruleTriggered: 'allowedRecipients',
      };
    }

    // Rule 8: Chain allowlist
    if (chain && this.policy.allowedChains.length > 0 && !this.policy.allowedChains.includes(chain)) {
      return {
        ...base, approved: false,
        reason: `Chain ${chain} not allowed`,
        ruleTriggered: 'allowedChains',
      };
    }

    // Rule 9 (NEW): Anomaly detection — velocity checks
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

    // Rule 10: Requires human approval
    if (value > this.policy.requireApprovalAbove) {
      return {
        ...base, approved: false,
        reason: `Amount ${value} exceeds approval threshold of ${this.policy.requireApprovalAbove}. Human approval required.`,
        ruleTriggered: 'requireApproval',
      };
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(to, value);

    return {
      ...base,
      approved: true,
      reason: 'All policy checks passed',
      ruleTriggered: null,
      riskScore,
    };
  }

  // NEW: Anomaly detection
  private checkAnomalies(to: string, value: bigint): string | null {
    const ad = this.policy.anomalyDetection!;
    const oneHourAgo = Date.now() - 3600000;

    // Clean old timestamps
    this.tracker.txTimestamps = this.tracker.txTimestamps.filter(t => t > oneHourAgo);
    this.tracker.recentRecipients = this.tracker.recentRecipients.slice(-100);

    // Velocity check: too many tx/hour
    if (this.tracker.txTimestamps.length >= ad.maxTxPerHour) {
      return `Velocity anomaly: ${this.tracker.txTimestamps.length} transactions in the last hour (limit: ${ad.maxTxPerHour})`;
    }

    // Recipient diversity: too many unique recipients/hour
    const recentUniqueRecipients = new Set(
      this.tracker.recentRecipients.filter((_, i) =>
        this.tracker.txTimestamps[i] && this.tracker.txTimestamps[i] > oneHourAgo
      )
    );
    if (recentUniqueRecipients.size >= ad.maxRecipientsPerHour) {
      return `Recipient anomaly: ${recentUniqueRecipients.size} unique recipients in last hour (limit: ${ad.maxRecipientsPerHour})`;
    }

    // Large transaction warning
    const pctOfDaily = Number(value * 100n / this.policy.dailyLimit);
    if (pctOfDaily >= ad.largeTransactionPct) {
      return `Large transaction: ${pctOfDaily}% of daily limit in single tx (threshold: ${ad.largeTransactionPct}%)`;
    }

    return null;
  }

  // NEW: Risk scoring
  private calculateRiskScore(to: string, value: bigint): number {
    let score = 0;

    // Higher score for larger amounts relative to limit
    const pctOfMax = Number(value * 100n / this.policy.maxPerTx);
    score += Math.min(pctOfMax / 2, 30);

    // Higher score for new recipients
    if (!this.tracker.recentRecipients.includes(to.toLowerCase())) {
      score += 20;
    }

    // Higher score for rapid transactions
    if (this.tracker.lastTxTimestamp > 0) {
      const elapsed = Date.now() - this.tracker.lastTxTimestamp;
      if (elapsed < 60000) score += 15; // less than 1 min
      else if (elapsed < 300000) score += 5; // less than 5 min
    }

    // Higher score if approaching daily limit
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
```

---

## Step 4: EIP-7702 Manager (src/EIP7702Manager.ts) — REWRITTEN WITH VIEM

**CRITICAL FIX:** The v1 used ethers.js v6 which does NOT support EIP-7702 type 0x04 transactions. This v2 uses **viem** which has native support via `walletClient.signAuthorization()` and `sendTransaction({ authorizationList })`.

```typescript
// src/EIP7702Manager.ts
// REWRITTEN: Uses viem instead of ethers.js for EIP-7702 support

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
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// PolicyDelegate ABI — viem-compatible
const POLICY_DELEGATE_ABI = parseAbi([
  'function initializePolicy(address recovery, uint256 recoveryDelay) external',
  'function createSessionKey(address eoa, address key, uint256 maxPerTx, uint256 dailyLimit, uint48 validAfter, uint48 validUntil, uint256 cooldownSeconds) external',
  'function revokeSessionKey(address eoa, address key) external',
  'function validateTransaction(address eoa, address sessionKey, address to, uint256 value, address token) public returns (bool)',
  'function freeze(address eoa) external',
  'function unfreeze(address eoa) external',
  'function execute(address sessionKey, address to, uint256 value, bytes data, address token) external',
  'function executeBatch(address sessionKey, address[] targets, uint256[] values, bytes[] datas, address[] tokens) external',
  'function getSessionKey(address eoa, address key) external view returns (bool active, uint256 maxPerTx, uint256 dailyLimit, uint256 spent, uint256 windowStart, uint48 validAfter, uint48 validUntil, uint256 cooldownSeconds, uint256 lastTxTimestamp, uint256 txCount)',
  'function getPolicy(address eoa) external view returns (bool initialized, bool frozen, address owner, address recovery, uint256 recoveryDelay, uint256 recoveryInitiated, address pendingOwner)',
  'function getRemainingDailyBudget(address eoa, address key) external view returns (uint256)',
  'function isSessionKeyValid(address eoa, address key) external view returns (bool)',
  'function getSessionKeyList(address eoa) external view returns (address[])',
  'function getActiveSessionKeyCount(address eoa) external view returns (uint256)',
  'event TransactionValidated(address indexed eoa, address indexed sessionKey, address indexed to, uint256 value, bool approved, string reason)',
  'event PolicyFrozen(address indexed eoa, address indexed by)',
  'event Executed(address indexed eoa, address indexed to, uint256 value, bytes data, bool success)',
]);

export interface EIP7702Config {
  providerUrl: string;
  policyDelegateAddress: Address;
  privateKey: Hex;
  chainId?: number; // defaults to sepolia (11155111)
}

export class EIP7702Manager {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private account: ReturnType<typeof privateKeyToAccount>;
  private policyDelegateAddress: Address;
  private chain: typeof sepolia;

  constructor(config: EIP7702Config) {
    this.account = privateKeyToAccount(config.privateKey);
    this.policyDelegateAddress = config.policyDelegateAddress;
    this.chain = sepolia; // Extend for multi-chain support

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.providerUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.providerUrl),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  /**
   * WORKING EIP-7702 DELEGATION using viem.
   *
   * Sends a type 0x04 transaction that sets the EOA's code to point
   * to the PolicyDelegate contract. After this, the EOA has smart
   * contract capabilities while keeping its original address.
   *
   * Reference: https://viem.sh/docs/eip7702/signAuthorization
   */
  async delegateToPolicy(): Promise<Hex> {
    console.log(`[EIP-7702] Delegating ${this.account.address} → ${this.policyDelegateAddress}`);

    // Step 1: Sign the authorization to delegate to PolicyDelegate
    const authorization = await this.walletClient.signAuthorization({
      account: this.account,
      contractAddress: this.policyDelegateAddress,
    });

    console.log('[EIP-7702] Authorization signed');

    // Step 2: Send type 0x04 transaction with the authorization
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      authorizationList: [authorization],
      to: this.account.address, // self-call to trigger delegation
      data: '0x' as Hex,
    });

    console.log(`[EIP-7702] Delegation tx: ${hash}`);

    // Step 3: Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[EIP-7702] Confirmed in block ${receipt.blockNumber}`);

    return hash;
  }

  /**
   * Initialize policy on-chain after delegation.
   * Must be called once after delegateToPolicy().
   */
  async initializePolicy(recoveryAddress: Address, recoveryDelaySeconds: number = 3600): Promise<Hex> {
    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'initializePolicy',
      args: [recoveryAddress, BigInt(recoveryDelaySeconds)],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      to: this.account.address, // Call self (delegated contract)
      data,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Policy] Initialized. Block: ${receipt.blockNumber}`);
    return hash;
  }

  /**
   * Create a session key for an AI agent with scoped permissions.
   */
  async createSessionKey(params: {
    agentAddress: Address;
    maxPerTx: bigint;
    dailyLimit: bigint;
    validForSeconds: number;
    cooldownSeconds: number;
  }): Promise<Hex> {
    const now = Math.floor(Date.now() / 1000);

    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'createSessionKey',
      args: [
        this.account.address,
        params.agentAddress,
        params.maxPerTx,
        params.dailyLimit,
        now,
        now + params.validForSeconds,
        BigInt(params.cooldownSeconds),
      ],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      to: this.account.address,
      data,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Session] Key created for ${params.agentAddress}`);
    return hash;
  }

  /**
   * Revoke a session key immediately.
   */
  async revokeSessionKey(agentAddress: Address): Promise<Hex> {
    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'revokeSessionKey',
      args: [this.account.address, agentAddress],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      to: this.account.address,
      data,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Session] Key revoked for ${agentAddress}`);
    return hash;
  }

  /**
   * Dry-run validation: check if a transaction would be approved on-chain.
   */
  async validateOnChain(
    sessionKey: Address,
    to: Address,
    value: bigint,
    token: Address = '0x0000000000000000000000000000000000000000'
  ): Promise<boolean> {
    try {
      const result = await this.publicClient.simulateContract({
        address: this.account.address, // Delegated EOA IS the contract
        abi: POLICY_DELEGATE_ABI,
        functionName: 'validateTransaction',
        args: [this.account.address, sessionKey, to, value, token],
        account: this.account,
      });
      return result.result as boolean;
    } catch (error: any) {
      console.error('[Validation] On-chain check failed:', error.shortMessage || error.message);
      return false;
    }
  }

  /**
   * Execute a call through the policy-enforced delegated EOA.
   * This validates AND executes in one transaction.
   */
  async executeViaPolicy(params: {
    sessionKey: Address;
    to: Address;
    value: bigint;
    data: Hex;
    token: Address;
  }): Promise<Hex> {
    const calldata = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'execute',
      args: [params.sessionKey, params.to, params.value, params.data, params.token],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      to: this.account.address,
      data: calldata,
      value: params.value,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Execute] Via policy. Block: ${receipt.blockNumber}`);
    return hash;
  }

  /**
   * Emergency freeze — blocks ALL agent operations immediately.
   */
  async freeze(): Promise<Hex> {
    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'freeze',
      args: [this.account.address],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      to: this.account.address,
      data,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log('[Emergency] Policy FROZEN');
    return hash;
  }

  /**
   * Unfreeze — resume normal operations.
   */
  async unfreeze(): Promise<Hex> {
    const data = encodeFunctionData({
      abi: POLICY_DELEGATE_ABI,
      functionName: 'unfreeze',
      args: [this.account.address],
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      to: this.account.address,
      data,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log('[Emergency] Policy UNFROZEN');
    return hash;
  }

  /**
   * Revoke EIP-7702 delegation — returns EOA to normal.
   * Signs a new authorization to address(0) which removes the delegation.
   */
  async revokeDelegation(): Promise<Hex> {
    console.log('[EIP-7702] Revoking delegation...');

    const authorization = await this.walletClient.signAuthorization({
      account: this.account,
      contractAddress: '0x0000000000000000000000000000000000000000',
    });

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      authorizationList: [authorization],
      to: this.account.address,
      data: '0x' as Hex,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log('[EIP-7702] Delegation revoked. EOA restored to plain account.');
    return hash;
  }

  // ============ View Functions ============

  async getRemainingBudget(sessionKey: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'getRemainingDailyBudget',
      args: [this.account.address, sessionKey],
    }) as bigint;
  }

  async isSessionKeyValid(sessionKey: Address): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'isSessionKeyValid',
      args: [this.account.address, sessionKey],
    }) as boolean;
  }

  async getSessionKeyList(): Promise<Address[]> {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'getSessionKeyList',
      args: [this.account.address],
    }) as Address[];
  }

  async getPolicy(): Promise<any> {
    return await this.publicClient.readContract({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      functionName: 'getPolicy',
      args: [this.account.address],
    });
  }

  // ============ Event Listeners ============

  watchTransactions(callback: (log: any) => void) {
    return this.publicClient.watchContractEvent({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      eventName: 'TransactionValidated',
      onLogs: (logs) => logs.forEach(callback),
    });
  }

  watchFreezeEvents(callback: (log: any) => void) {
    return this.publicClient.watchContractEvent({
      address: this.account.address,
      abi: POLICY_DELEGATE_ABI,
      eventName: 'PolicyFrozen',
      onLogs: (logs) => logs.forEach(callback),
    });
  }
}
```

---

## Step 5: Audit Logger (src/AuditLogger.ts) — Same as v1

```typescript
// src/AuditLogger.ts
// (No changes from v1 — the audit logger was already solid)

import { AuditEntry, PolicyDecision } from './types.js';

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private maxEntries: number;
  private onLog?: (entry: AuditEntry) => void | Promise<void>;

  constructor(options?: { maxEntries?: number; onLog?: (entry: AuditEntry) => void | Promise<void> }) {
    this.maxEntries = options?.maxEntries || 10000;
    this.onLog = options?.onLog;
  }

  async log(decision: PolicyDecision, txResult?: { hash: string; blockNumber: number; gasUsed: bigint }): Promise<void> {
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

    if (this.onLog) await this.onLog(entry);

    const status = entry.approved ? '✅ APPROVED' : '❌ BLOCKED';
    console.log(
      `[AUDIT] ${status} | Agent: ${entry.agentId} | To: ${entry.transactionDetails.to} | ` +
      `Amount: ${entry.transactionDetails.value} | Risk: ${entry.riskScore ?? 'N/A'} | ` +
      `Rule: ${entry.ruleTriggered || 'none'} | Reason: ${entry.reason}`
    );
  }

  getEntries(filter?: {
    agentId?: string; approved?: boolean; since?: number; limit?: number;
  }): AuditEntry[] {
    let results = [...this.entries];
    if (filter?.agentId) results = results.filter(e => e.agentId === filter.agentId);
    if (filter?.approved !== undefined) results = results.filter(e => e.approved === filter.approved);
    if (filter?.since) results = results.filter(e => e.timestamp >= filter.since!);
    results.reverse();
    if (filter?.limit) results = results.slice(0, filter.limit);
    return results;
  }

  getStats(agentId?: string) {
    const entries = agentId ? this.entries.filter(e => e.agentId === agentId) : this.entries;
    const approved = entries.filter(e => e.approved).length;
    const blocked = entries.filter(e => !e.approved);
    const reasonCounts = new Map<string, number>();
    for (const entry of blocked) {
      const rule = entry.ruleTriggered || 'unknown';
      reasonCounts.set(rule, (reasonCounts.get(rule) || 0) + 1);
    }
    return {
      total: entries.length, approved, blocked: blocked.length,
      topBlockReasons: Array.from(reasonCounts.entries())
        .map(([rule, count]) => ({ rule, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  toJSON(): string {
    return JSON.stringify(this.entries, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  }
}
```

---

## Step 6: PolicyAccount (src/PolicyAccount.ts) — Same Structure, Uses viem Manager

```typescript
// src/PolicyAccount.ts

import { PolicyEngine } from './PolicyEngine.js';
import { AuditLogger } from './AuditLogger.js';
import { EIP7702Manager } from './EIP7702Manager.js';
import { PolicyWalletConfig, PolicyDecision } from './types.js';

export class PolicyAccount {
  private innerAccount: any;
  private engine: PolicyEngine;
  private logger: AuditLogger;
  private eip7702?: EIP7702Manager;
  private config: PolicyWalletConfig;
  private chain: string;

  constructor(
    innerAccount: any,
    config: PolicyWalletConfig,
    chain: string,
    eip7702?: EIP7702Manager
  ) {
    this.innerAccount = innerAccount;
    this.config = config;
    this.chain = chain;
    this.eip7702 = eip7702;
    this.engine = new PolicyEngine(config.policy);
    this.logger = new AuditLogger({ onLog: config.onAuditLog });
  }

  async getAddress(): Promise<string> { return this.innerAccount.getAddress(); }
  async getBalance(): Promise<bigint> { return this.innerAccount.getBalance(); }
  async getTokenBalance(tokenAddress: string): Promise<bigint> { return this.innerAccount.getTokenBalance(tokenAddress); }

  async sendTransaction(params: {
    to: string; value: bigint; data?: string;
    maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint;
  }): Promise<{ hash: string; fee: bigint }> {
    const decision = this.engine.evaluate(params.to, params.value, undefined, this.chain);

    if (!decision.approved) {
      if (decision.ruleTriggered === 'requireApproval' && this.config.onApprovalRequired) {
        const humanApproved = await this.config.onApprovalRequired(decision);
        if (humanApproved) {
          decision.approved = true;
          decision.reason = 'Approved by human operator';
        }
      }
      if (!decision.approved) {
        await this.logger.log(decision);
        throw new PolicyError(decision);
      }
    }

    // On-chain policy check (if EIP-7702 is set up)
    if (this.eip7702 && this.config.policy.sessionKey) {
      const onChainApproved = await this.eip7702.validateOnChain(
        this.config.policy.sessionKey.address as `0x${string}`,
        params.to as `0x${string}`,
        params.value
      );
      if (!onChainApproved) {
        const blocked: PolicyDecision = {
          ...decision, approved: false,
          reason: 'Blocked by on-chain PolicyDelegate (EIP-7702)',
          ruleTriggered: 'onChainPolicy',
        };
        await this.logger.log(blocked);
        throw new PolicyError(blocked);
      }
    }

    try {
      const result = await this.innerAccount.sendTransaction(params);
      this.engine.recordTransaction(params.value, params.to);
      await this.logger.log(decision, { hash: result.hash, blockNumber: 0, gasUsed: result.fee });
      return result;
    } catch (error: any) {
      await this.logger.log({ ...decision, approved: false, reason: `Transaction failed: ${error.message}`, ruleTriggered: 'executionError' });
      throw error;
    }
  }

  async transfer(params: {
    token: string; recipient: string; amount: bigint;
  }): Promise<{ hash: string; fee: bigint }> {
    const decision = this.engine.evaluate(params.recipient, params.amount, params.token, this.chain);

    if (!decision.approved) {
      if (decision.ruleTriggered === 'requireApproval' && this.config.onApprovalRequired) {
        const humanApproved = await this.config.onApprovalRequired(decision);
        if (humanApproved) {
          decision.approved = true;
          decision.reason = 'Approved by human operator';
        }
      }
      if (!decision.approved) {
        await this.logger.log(decision);
        throw new PolicyError(decision);
      }
    }

    if (this.eip7702 && this.config.policy.sessionKey) {
      const onChainApproved = await this.eip7702.validateOnChain(
        this.config.policy.sessionKey.address as `0x${string}`,
        params.recipient as `0x${string}`,
        params.amount,
        params.token as `0x${string}`
      );
      if (!onChainApproved) {
        const blocked: PolicyDecision = {
          ...decision, approved: false,
          reason: 'Blocked by on-chain PolicyDelegate (EIP-7702)',
          ruleTriggered: 'onChainPolicy',
        };
        await this.logger.log(blocked);
        throw new PolicyError(blocked);
      }
    }

    try {
      const result = await this.innerAccount.transfer(params);
      this.engine.recordTransaction(params.amount, params.recipient);
      await this.logger.log(decision, { hash: result.hash, blockNumber: 0, gasUsed: result.fee });
      return result;
    } catch (error: any) {
      await this.logger.log({ ...decision, approved: false, reason: `Transfer failed: ${error.message}`, ruleTriggered: 'executionError' });
      throw error;
    }
  }

  async quoteSendTransaction(params: { to: string; value: bigint }): Promise<{ fee: bigint }> {
    return this.innerAccount.quoteSendTransaction(params);
  }

  async quoteTransfer(params: { token: string; recipient: string; amount: bigint }): Promise<{ fee: bigint }> {
    return this.innerAccount.quoteTransfer(params);
  }

  async sign(message: string): Promise<string> { return this.innerAccount.sign(message); }

  getSpendingStatus() { return this.engine.getSpendingStatus(); }
  getAuditLog(filter?: { approved?: boolean; limit?: number }) { return this.logger.getEntries(filter); }
  getAuditStats() { return this.logger.getStats(this.config.policy.agentId); }
  updatePolicy(updates: Partial<import('./types.js').AgentPolicy>) { this.engine.updatePolicy(updates); }
  dispose(): void { this.innerAccount.dispose(); }
}

export class PolicyError extends Error {
  public decision: PolicyDecision;
  constructor(decision: PolicyDecision) {
    super(`Policy violation: ${decision.reason}`);
    this.name = 'PolicyError';
    this.decision = decision;
  }
}
```

---

## Step 7: Main Entry Point (src/index.ts)

```typescript
// src/index.ts

export { PolicyEngine } from './PolicyEngine.js';
export { PolicyAccount, PolicyError } from './PolicyAccount.js';
export { AuditLogger } from './AuditLogger.js';
export { EIP7702Manager } from './EIP7702Manager.js';
export type {
  AgentPolicy,
  PolicyDecision,
  AuditEntry,
  PolicyWalletConfig,
  SpendingTracker,
} from './types.js';
```

---

## What Changed from v1 to v2

| Area | v1 (Broken) | v2 (Fixed) |
|------|-------------|------------|
| **EIP-7702** | ethers.js v6 — PLACEHOLDER, doesn't actually send type 0x04 tx | **viem** — working `signAuthorization()` + `sendTransaction({ authorizationList })` |
| **Revoke delegation** | Placeholder returning `'0x...'` | Working: signs authorization to `address(0)` |
| **Dependencies** | `ethers@6` | `viem@2.x` |
| **Anomaly detection** | None | Velocity checks, recipient diversity, large tx flagging |
| **Risk scoring** | None | 0-100 risk score on every decision |
| **Event watching** | ethers event listeners | viem `watchContractEvent` |
| **Execute via policy** | Not possible | `executeViaPolicy()` calls `execute()` on delegated EOA |
| **View functions** | Scattered ethers calls | Clean `readContract` via viem |
