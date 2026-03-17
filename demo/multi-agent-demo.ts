// demo/multi-agent-demo.ts
// Standalone ClawVault multi-agent policy demo — no external dependencies

// ─── ANSI Colors ───────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

// ─── Simulated Clock ──────────────────────────────────────────────────────────
// Allows the demo to run instantly while still testing time-dependent policies
// (cooldowns, daily windows, hourly velocity). Advance with clock.tick(ms).

const clock = {
  _now: Date.now(),
  now(): number {
    return this._now;
  },
  tick(ms: number): void {
    this._now += ms;
  },
};

// ─── Inline Types ──────────────────────────────────────────────────────────────

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

interface SpendingTracker {
  spent: bigint;
  windowStart: number;
  lastTxTimestamp: number;
  txTimestamps: number[];
  recentRecipients: string[];
}

// ─── Inline PolicyEngine (mirrors packages/policy-engine logic) ────────────────

class PolicyEngine {
  private policy: AgentPolicy;
  private tracker: SpendingTracker;

  constructor(policy: AgentPolicy) {
    this.policy = policy;
    this.tracker = {
      spent: 0n,
      windowStart: clock.now(),
      lastTxTimestamp: 0,
      txTimestamps: [],
      recentRecipients: [],
    };
  }

  evaluate(to: string, value: bigint): PolicyDecision {
    const now = clock.now();
    const base = {
      timestamp: now,
      agentId: this.policy.agentId,
      transactionDetails: { to, value, token: 'USDT', chain: 'sepolia' },
    };

    if (value > this.policy.maxPerTx) {
      return {
        ...base,
        approved: false,
        reason: `Amount ${formatUsdt(value)} exceeds per-tx limit of ${formatUsdt(this.policy.maxPerTx)}`,
        ruleTriggered: 'maxPerTx',
        riskScore: 95,
      };
    }

    this.resetWindowIfExpired();
    if (this.tracker.spent + value > this.policy.dailyLimit) {
      return {
        ...base,
        approved: false,
        reason: `Daily spending would reach ${formatUsdt(this.tracker.spent + value)}, exceeding limit of ${formatUsdt(this.policy.dailyLimit)}`,
        ruleTriggered: 'dailyLimit',
        riskScore: 90,
      };
    }

    if (this.policy.cooldownMs > 0 && this.tracker.lastTxTimestamp > 0) {
      const elapsed = now - this.tracker.lastTxTimestamp;
      if (elapsed < this.policy.cooldownMs) {
        return {
          ...base,
          approved: false,
          reason: `Cooldown active. ${this.policy.cooldownMs - elapsed}ms remaining`,
          ruleTriggered: 'cooldown',
          riskScore: 60,
        };
      }
    }

    if (this.policy.anomalyDetection) {
      const anomaly = this.checkAnomalies(to, value);
      if (anomaly) {
        return {
          ...base,
          approved: false,
          reason: anomaly,
          ruleTriggered: 'anomalyDetection',
          riskScore: 85,
        };
      }
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

  recordTransaction(value: bigint, recipient: string): void {
    const now = clock.now();
    this.resetWindowIfExpired();
    this.tracker.spent += value;
    this.tracker.lastTxTimestamp = now;
    this.tracker.txTimestamps.push(now);
    this.tracker.recentRecipients.push(recipient.toLowerCase());
  }

  getSpent(): bigint {
    return this.tracker.spent;
  }

  private checkAnomalies(_to: string, value: bigint): string | null {
    const ad = this.policy.anomalyDetection!;
    const oneHourAgo = clock.now() - 3_600_000;

    this.tracker.txTimestamps = this.tracker.txTimestamps.filter(t => t > oneHourAgo);

    if (this.tracker.txTimestamps.length >= ad.maxTxPerHour) {
      return `Velocity anomaly: ${this.tracker.txTimestamps.length} tx/hr (limit: ${ad.maxTxPerHour})`;
    }

    const recentUniqueRecipients = new Set(
      this.tracker.recentRecipients.filter(
        (_, i) => this.tracker.txTimestamps[i] && this.tracker.txTimestamps[i] > oneHourAgo,
      ),
    );
    if (recentUniqueRecipients.size >= ad.maxRecipientsPerHour) {
      return `Recipient diversity anomaly: ${recentUniqueRecipients.size} unique recipients/hr (limit: ${ad.maxRecipientsPerHour})`;
    }

    const pctOfDaily = Number((value * 100n) / this.policy.dailyLimit);
    if (pctOfDaily >= ad.largeTransactionPct) {
      return `Large tx: ${pctOfDaily}% of daily limit in single tx (threshold: ${ad.largeTransactionPct}%)`;
    }

    return null;
  }

  private calculateRiskScore(to: string, value: bigint): number {
    let score = 0;

    const pctOfMax = Number((value * 100n) / this.policy.maxPerTx);
    score += Math.min(pctOfMax / 2, 30);

    if (!this.tracker.recentRecipients.includes(to.toLowerCase())) {
      score += 20;
    }

    if (this.tracker.lastTxTimestamp > 0) {
      const elapsed = clock.now() - this.tracker.lastTxTimestamp;
      if (elapsed < 60_000) score += 15;
      else if (elapsed < 300_000) score += 5;
    }

    const pctOfDaily = Number(((this.tracker.spent + value) * 100n) / this.policy.dailyLimit);
    if (pctOfDaily > 80) score += 20;
    else if (pctOfDaily > 50) score += 10;

    return Math.min(Math.round(score), 100);
  }

  private resetWindowIfExpired(): void {
    const now = clock.now();
    if (now > this.tracker.windowStart + 86_400_000) {
      this.tracker.spent = 0n;
      this.tracker.windowStart = now;
    }
  }
}

// ─── Inline AuditLogger ───────────────────────────────────────────────────────

interface AuditEntry extends PolicyDecision {
  txIndex: number;
}

class AuditLogger {
  private entries: AuditEntry[] = [];
  private txCounter = 0;

  log(decision: PolicyDecision): void {
    this.txCounter++;
    this.entries.push({ ...decision, txIndex: this.txCounter });
  }

  getEntriesForAgent(agentId: string): AuditEntry[] {
    return this.entries.filter(e => e.agentId === agentId);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USDT_DECIMALS = 6;

function usdt(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDT_DECIMALS));
}

function formatUsdt(value: bigint): string {
  const whole = value / BigInt(10 ** USDT_DECIMALS);
  const frac = value % BigInt(10 ** USDT_DECIMALS);
  if (frac === 0n) return `${whole} USDT`;
  return `${whole}.${frac.toString().padStart(USDT_DECIMALS, '0').replace(/0+$/, '')} USDT`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function riskColor(score: number): string {
  if (score <= 30) return C.green;
  if (score <= 60) return C.yellow;
  return C.red;
}

function statusBadge(approved: boolean): string {
  if (approved) return `${C.bgGreen}${C.bold} APPROVED ${C.reset}`;
  return `${C.bgRed}${C.bold} BLOCKED  ${C.reset}`;
}

// ─── Recipients ───────────────────────────────────────────────────────────────

const RECIPIENTS = [
  '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
  '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
  '0x1234567890AbCdEf1234567890AbCdEf12345678',
  '0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef',
  '0xCafeBabeCafeBabeCafeBabeCafeBabeCafeBabe',
];

// ─── Agent Profiles ───────────────────────────────────────────────────────────

function makePolicy(
  agentId: string,
  maxPerTx: number,
  dailyLimit: number,
  cooldownSec: number,
  anomaly: { maxTxPerHour: number; maxRecipientsPerHour: number; largeTransactionPct: number },
): AgentPolicy {
  return {
    agentId,
    maxPerTx: usdt(maxPerTx),
    dailyLimit: usdt(dailyLimit),
    requireApprovalAbove: usdt(dailyLimit * 10),
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: [],
    cooldownMs: cooldownSec * 1000,
    anomalyDetection: anomaly,
  };
}

interface TxScenario {
  amount: number;
  recipient: string;
  note: string;
  rapid?: boolean;
}

const AGENT_PROFILES = [
  {
    name: 'Conservative Agent',
    emoji: '\u{1f6e1}\ufe0f ',
    policy: makePolicy('conservative', 10, 50, 60, {
      maxTxPerHour: 5,
      maxRecipientsPerHour: 3,
      largeTransactionPct: 40,
    }),
    transactions: [
      { amount: 5, recipient: RECIPIENTS[0], note: 'Normal small transfer' },
      { amount: 8, recipient: RECIPIENTS[1], note: 'Within limits' },
      { amount: 3, recipient: RECIPIENTS[0], note: 'Known recipient, low amount' },
      { amount: 15, recipient: RECIPIENTS[2], note: 'EXCEEDS per-tx limit' },
      { amount: 5, recipient: RECIPIENTS[3], note: 'Rapid fire — tests cooldown', rapid: true },
    ] as TxScenario[],
  },
  {
    name: 'Moderate Agent',
    emoji: '\u2696\ufe0f ',
    policy: makePolicy('moderate', 50, 200, 30, {
      maxTxPerHour: 10,
      maxRecipientsPerHour: 5,
      largeTransactionPct: 50,
    }),
    transactions: [
      { amount: 20, recipient: RECIPIENTS[0], note: 'Standard transfer' },
      { amount: 45, recipient: RECIPIENTS[1], note: 'Medium transfer' },
      { amount: 45, recipient: RECIPIENTS[2], note: 'Approaching per-tx limit' },
      { amount: 60, recipient: RECIPIENTS[3], note: 'EXCEEDS per-tx limit' },
      { amount: 50, recipient: RECIPIENTS[0], note: 'Max allowed per-tx' },
      { amount: 50, recipient: RECIPIENTS[4], note: 'Exceeds daily limit (160 + 50 > 200)' },
    ] as TxScenario[],
  },
  {
    name: 'Aggressive Agent',
    emoji: '\u{1f525} ',
    policy: makePolicy('aggressive', 200, 1000, 10, {
      maxTxPerHour: 20,
      maxRecipientsPerHour: 10,
      largeTransactionPct: 60,
    }),
    transactions: [
      { amount: 100, recipient: RECIPIENTS[0], note: 'Large transfer' },
      { amount: 150, recipient: RECIPIENTS[1], note: 'Significant transfer' },
      { amount: 180, recipient: RECIPIENTS[2], note: 'Near per-tx limit' },
      { amount: 250, recipient: RECIPIENTS[3], note: 'EXCEEDS per-tx limit' },
      { amount: 50, recipient: RECIPIENTS[0], note: 'Rapid fire #1', rapid: true },
      { amount: 50, recipient: RECIPIENTS[1], note: 'Rapid fire #2', rapid: true },
    ] as TxScenario[],
  },
];

// ─── Display Functions ────────────────────────────────────────────────────────

function printHeader(): void {
  console.log('');
  console.log(`${C.bold}${C.cyan}${'='.repeat(76)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}||${C.reset}${' '.repeat(72)}${C.bold}${C.cyan}||${C.reset}`);
  console.log(`${C.bold}${C.cyan}||${C.reset}   ${C.bold}ClawVault${C.reset} -- Multi-Agent Policy Enforcement Demo${' '.repeat(20)}${C.bold}${C.cyan}||${C.reset}`);
  console.log(`${C.bold}${C.cyan}||${C.reset}   EIP-7702 policy layer for AI agent wallets${' '.repeat(26)}${C.bold}${C.cyan}||${C.reset}`);
  console.log(`${C.bold}${C.cyan}||${C.reset}${' '.repeat(72)}${C.bold}${C.cyan}||${C.reset}`);
  console.log(`${C.bold}${C.cyan}${'='.repeat(76)}${C.reset}`);
  console.log('');
}

function printAgentHeader(name: string, emoji: string, policy: AgentPolicy): void {
  console.log(`${C.bold}${C.magenta}${'-'.repeat(76)}${C.reset}`);
  console.log(`${C.bold}  ${emoji}${name}${C.reset}`);
  console.log(`${C.dim}  Max/tx: ${formatUsdt(policy.maxPerTx)} | Daily: ${formatUsdt(policy.dailyLimit)} | Cooldown: ${policy.cooldownMs / 1000}s${C.reset}`);
  if (policy.anomalyDetection) {
    const ad = policy.anomalyDetection;
    console.log(`${C.dim}  Anomaly: ${ad.maxTxPerHour} tx/hr | ${ad.maxRecipientsPerHour} recipients/hr | large tx > ${ad.largeTransactionPct}% daily${C.reset}`);
  }
  console.log(`${C.bold}${C.magenta}${'-'.repeat(76)}${C.reset}`);
  console.log('');
}

function printTxResult(index: number, decision: PolicyDecision, note: string): void {
  const risk = decision.riskScore ?? 0;
  const rColor = riskColor(risk);
  const amount = formatUsdt(decision.transactionDetails.value);
  const to = shortAddr(decision.transactionDetails.to);
  const rule = decision.ruleTriggered ? `${C.red}[${decision.ruleTriggered}]${C.reset}` : '';

  console.log(
    `  ${C.dim}#${index}${C.reset} ${statusBadge(decision.approved)} ` +
    `${C.bold}${amount.padEnd(12)}${C.reset} ` +
    `${C.dim}to${C.reset} ${to}  ` +
    `${rColor}risk: ${risk.toString().padStart(2)}${C.reset} ` +
    `${rule}`,
  );
  console.log(`     ${C.dim}${note}${C.reset}`);
  if (!decision.approved) {
    console.log(`     ${C.red}${decision.reason}${C.reset}`);
  }
  console.log('');
}

function printAgentSummary(
  name: string,
  entries: AuditEntry[],
  spent: bigint,
): void {
  const approved = entries.filter(e => e.approved).length;
  const blocked = entries.filter(e => !e.approved).length;
  const risks = entries.filter(e => e.riskScore !== undefined).map(e => e.riskScore!);
  const avgRisk = risks.length > 0 ? Math.round(risks.reduce((a, b) => a + b, 0) / risks.length) : 0;
  const approvedVolume = entries
    .filter(e => e.approved)
    .reduce((sum, e) => sum + e.transactionDetails.value, 0n);

  console.log(
    `  ${C.bold}${name}${C.reset}: ` +
    `${C.green}${approved} approved${C.reset} | ` +
    `${C.red}${blocked} blocked${C.reset} | ` +
    `avg risk: ${avgRisk} | ` +
    `volume: ${formatUsdt(approvedVolume)} | ` +
    `spent: ${formatUsdt(spent)}`,
  );
}

interface AgentStats {
  name: string;
  approved: number;
  blocked: number;
  avgRisk: number;
  volume: bigint;
}

function printFinalSummary(stats: AgentStats[]): void {
  console.log('');
  console.log(`${C.bold}${C.cyan}${'='.repeat(76)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  FINAL SUMMARY${C.reset}`);
  console.log(`${C.bold}${C.cyan}${'='.repeat(76)}${C.reset}`);
  console.log('');

  console.log(`  ${C.bold}${'Agent'.padEnd(22)}${'Approved'.padEnd(12)}${'Blocked'.padEnd(12)}${'Avg Risk'.padEnd(12)}${'Volume'.padEnd(16)}${C.reset}`);
  console.log(`  ${'-'.repeat(70)}`);

  let totalApproved = 0;
  let totalBlocked = 0;
  let totalVolume = 0n;
  let totalRiskSum = 0;
  let totalRiskCount = 0;

  for (const s of stats) {
    const volStr = formatUsdt(s.volume);
    console.log(
      `  ${s.name.padEnd(22)}` +
      `${C.green}${s.approved.toString().padEnd(12)}${C.reset}` +
      `${C.red}${s.blocked.toString().padEnd(12)}${C.reset}` +
      `${riskColor(s.avgRisk)}${s.avgRisk.toString().padEnd(12)}${C.reset}` +
      `${volStr}`,
    );

    totalApproved += s.approved;
    totalBlocked += s.blocked;
    totalVolume += s.volume;
    totalRiskSum += s.avgRisk;
    totalRiskCount++;
  }

  console.log(`  ${'-'.repeat(70)}`);
  const totalAvgRisk = totalRiskCount > 0 ? Math.round(totalRiskSum / totalRiskCount) : 0;
  console.log(
    `  ${C.bold}${'TOTAL'.padEnd(22)}${C.reset}` +
    `${C.green}${C.bold}${totalApproved.toString().padEnd(12)}${C.reset}` +
    `${C.red}${C.bold}${totalBlocked.toString().padEnd(12)}${C.reset}` +
    `${C.bold}${totalAvgRisk.toString().padEnd(12)}${C.reset}` +
    `${C.bold}${formatUsdt(totalVolume)}${C.reset}`,
  );
  console.log('');
  console.log(`  ${C.dim}Total transactions evaluated: ${totalApproved + totalBlocked}${C.reset}`);
  console.log(`  ${C.dim}Enforcement rate: ${Math.round((totalBlocked / (totalApproved + totalBlocked)) * 100)}% of transactions blocked${C.reset}`);
  console.log('');
}

// ─── Main Demo ────────────────────────────────────────────────────────────────

function main(): void {
  printHeader();

  const logger = new AuditLogger();
  const allStats: AgentStats[] = [];

  for (const profile of AGENT_PROFILES) {
    const engine = new PolicyEngine(profile.policy);
    printAgentHeader(profile.name, profile.emoji, profile.policy);

    let txIndex = 0;
    for (const tx of profile.transactions) {
      txIndex++;
      const value = usdt(tx.amount);
      const decision = engine.evaluate(tx.recipient, value);
      logger.log(decision);

      printTxResult(txIndex, decision, tx.note);

      if (decision.approved) {
        engine.recordTransaction(value, tx.recipient);
      }

      // Non-rapid transactions advance the clock past the cooldown period.
      // Rapid transactions do NOT advance the clock, triggering cooldown blocks.
      if (!tx.rapid) {
        clock.tick(profile.policy.cooldownMs + 1000);
      }
    }

    const entries = logger.getEntriesForAgent(profile.policy.agentId);
    console.log(`${C.dim}  --- Agent Summary ---${C.reset}`);
    printAgentSummary(profile.name, entries, engine.getSpent());
    console.log('');

    const approved = entries.filter(e => e.approved).length;
    const blocked = entries.filter(e => !e.approved).length;
    const risks = entries.filter(e => e.riskScore !== undefined).map(e => e.riskScore!);
    const avgRisk = risks.length > 0 ? Math.round(risks.reduce((a, b) => a + b, 0) / risks.length) : 0;
    const volume = entries
      .filter(e => e.approved)
      .reduce((sum, e) => sum + e.transactionDetails.value, 0n);

    allStats.push({ name: profile.name, approved, blocked, avgRisk, volume });
  }

  printFinalSummary(allStats);
}

main();
