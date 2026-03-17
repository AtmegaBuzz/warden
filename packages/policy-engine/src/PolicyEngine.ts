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
      transactionDetails: { to, value, token, chain: chain ?? 'ethereum' },
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
