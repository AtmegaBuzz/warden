import { AgentPolicy, PolicyDecision, SpendingTracker, RiskFactors } from './types.js';

const ONE_HOUR_MS = 3600_000;
const ONE_DAY_MS = 86400_000;
const ONE_WEEK_MS = 604800_000;
const ONE_MONTH_MS = 2592000_000; // 30 days

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
      recentAmounts: [],
      txCount: 0,
      weeklySpent: 0n,
      weeklyWindowStart: Date.now(),
      monthlySpent: 0n,
      monthlyWindowStart: Date.now(),
      recipientSpendMap: {},
    };
  }

  evaluate(to: string, value: bigint, token?: string, chain?: string): PolicyDecision {
    const base = {
      timestamp: Date.now(),
      agentId: this.policy.agentId,
      transactionDetails: { to, value, token, chain: chain ?? 'ethereum' },
    };

    // Rule 1: Minimum transaction value (anti-dust)
    if (this.policy.minPerTx && value > 0n && value < this.policy.minPerTx) {
      return {
        ...base, approved: false,
        reason: `Amount ${value} below minimum of ${this.policy.minPerTx}`,
        ruleTriggered: 'minPerTx',
      };
    }

    // Rule 2: Velocity ramp-up (graduated limits)
    if (this.policy.velocityRampUp) {
      const ramp = this.policy.velocityRampUp;
      const elapsedDays = (Date.now() - ramp.createdAt) / ONE_DAY_MS;
      const progress = Math.min(elapsedDays / ramp.rampDays, 1);
      const currentMax = ramp.initialMaxPerTx +
        BigInt(Math.floor(Number(ramp.finalMaxPerTx - ramp.initialMaxPerTx) * progress));
      if (value > currentMax) {
        return {
          ...base, approved: false,
          reason: `Ramp-up: current max is ${currentMax} (day ${Math.floor(elapsedDays)}/${ramp.rampDays})`,
          ruleTriggered: 'velocityRampUp',
        };
      }
    }

    // Rule 3: Per-transaction limit
    if (value > this.policy.maxPerTx) {
      return {
        ...base, approved: false,
        reason: `Amount ${value} exceeds per-transaction limit of ${this.policy.maxPerTx}`,
        ruleTriggered: 'maxPerTx',
      };
    }

    // Rule 4: Daily limit (rolling 24h)
    this.resetWindowIfExpired();
    if (this.tracker.spent + value > this.policy.dailyLimit) {
      return {
        ...base, approved: false,
        reason: `Daily spending would reach ${this.tracker.spent + value}, exceeding limit of ${this.policy.dailyLimit}`,
        ruleTriggered: 'dailyLimit',
      };
    }

    // Rule 5: Weekly limit
    if (this.policy.weeklyLimit) {
      this.resetWeeklyWindowIfExpired();
      if (this.tracker.weeklySpent + value > this.policy.weeklyLimit) {
        return {
          ...base, approved: false,
          reason: `Weekly spending would exceed limit of ${this.policy.weeklyLimit}`,
          ruleTriggered: 'weeklyLimit',
        };
      }
    }

    // Rule 6: Monthly limit
    if (this.policy.monthlyLimit) {
      this.resetMonthlyWindowIfExpired();
      if (this.tracker.monthlySpent + value > this.policy.monthlyLimit) {
        return {
          ...base, approved: false,
          reason: `Monthly spending would exceed limit of ${this.policy.monthlyLimit}`,
          ruleTriggered: 'monthlyLimit',
        };
      }
    }

    // Rule 7: Daily transaction count cap
    if (this.policy.maxTxPerDay && this.tracker.txCount >= this.policy.maxTxPerDay) {
      return {
        ...base, approved: false,
        reason: `Daily transaction count ${this.tracker.txCount} reached max of ${this.policy.maxTxPerDay}`,
        ruleTriggered: 'maxTxPerDay',
      };
    }

    // Rule 8: Per-token spending limit
    if (token && this.policy.perTokenLimits) {
      const tokenKey = token.toLowerCase();
      const tokenLimit = this.policy.perTokenLimits[tokenKey];
      if (tokenLimit !== undefined && value > tokenLimit) {
        return {
          ...base, approved: false,
          reason: `Amount ${value} exceeds per-token limit of ${tokenLimit} for ${token}`,
          ruleTriggered: 'perTokenLimit',
        };
      }
    }

    // Rule 9: Cooldown enforcement
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

    // Rule 10: Session key max uses
    if (this.policy.sessionKey?.maxUses) {
      if (this.tracker.txCount >= this.policy.sessionKey.maxUses) {
        return {
          ...base, approved: false,
          reason: `Session key exhausted: ${this.tracker.txCount}/${this.policy.sessionKey.maxUses} uses`,
          ruleTriggered: 'sessionKeyMaxUses',
        };
      }
    }

    // Rule 11: Blocked tokens
    if (token && this.policy.blockedTokens.length > 0 && this.policy.blockedTokens.includes(token.toLowerCase())) {
      return { ...base, approved: false, reason: `Token ${token} is blocked`, ruleTriggered: 'blockedToken' };
    }

    // Rule 12: Allowed tokens
    if (token && this.policy.allowedTokens.length > 0 && !this.policy.allowedTokens.includes(token.toLowerCase())) {
      return { ...base, approved: false, reason: `Token ${token} not in allowed list`, ruleTriggered: 'allowedTokens' };
    }

    // Rule 13: Blocked recipients
    const toLower = to.toLowerCase();
    if (this.policy.blockedRecipients.length > 0 && this.policy.blockedRecipients.includes(toLower)) {
      return { ...base, approved: false, reason: `Recipient ${to} is blocked`, ruleTriggered: 'blockedRecipient' };
    }

    // Rule 14: Allowed recipients
    if (this.policy.allowedRecipients.length > 0 && !this.policy.allowedRecipients.includes(toLower)) {
      return { ...base, approved: false, reason: `Recipient ${to} not in allowed list`, ruleTriggered: 'allowedRecipients' };
    }

    // Rule 15: Allowed chains
    if (chain && this.policy.allowedChains.length > 0 && !this.policy.allowedChains.includes(chain)) {
      return { ...base, approved: false, reason: `Chain ${chain} not allowed`, ruleTriggered: 'allowedChains' };
    }

    // Rule 16: Time-of-day operating window
    if (this.policy.activeHoursUTC) {
      const hours = new Date().getUTCHours();
      const { start, end } = this.policy.activeHoursUTC;
      const inWindow = start <= end
        ? hours >= start && hours < end
        : hours >= start || hours < end; // overnight wrap
      if (!inWindow) {
        return {
          ...base, approved: false,
          reason: `Outside operating hours (${start}:00-${end}:00 UTC, current: ${hours}:00)`,
          ruleTriggered: 'activeHours',
        };
      }
    }

    // Rule 17: Anomaly detection
    if (this.policy.anomalyDetection) {
      const anomaly = this.checkAnomalies(to, value);
      if (anomaly) {
        return { ...base, approved: false, reason: anomaly, ruleTriggered: 'anomalyDetection', riskScore: 85 };
      }
    }

    // Rule 18: Tiered authorization
    if (this.policy.tieredAuthorization) {
      const tier = this.resolveTier(value);
      if (tier) {
        if (tier.action === 'require_approval') {
          return {
            ...base, approved: false,
            reason: `Amount ${value} requires human approval (tier: ${tier.action})`,
            ruleTriggered: 'requireApproval', tieredAction: tier.action,
          };
        }
        if (tier.action === 'require_multisig') {
          return {
            ...base, approved: false,
            reason: `Amount ${value} requires multi-sig approval (tier: ${tier.action})`,
            ruleTriggered: 'requireMultisig', tieredAction: tier.action,
          };
        }
      }
    }

    // Rule 19: Require approval above (legacy fallback)
    if (value > this.policy.requireApprovalAbove) {
      return {
        ...base, approved: false,
        reason: `Amount ${value} exceeds approval threshold of ${this.policy.requireApprovalAbove}. Human approval required.`,
        ruleTriggered: 'requireApproval',
      };
    }

    const riskFactors = this.calculateRiskFactors(to, value);
    const riskScore = this.computeRiskScore(riskFactors);

    return {
      ...base, approved: true,
      reason: 'All policy checks passed',
      ruleTriggered: null, riskScore, riskFactors,
    };
  }

  // ============ Anomaly Detection (8 checks) ============

  private checkAnomalies(to: string, value: bigint): string | null {
    const ad = this.policy.anomalyDetection!;
    const now = Date.now();
    const oneHourAgo = now - ONE_HOUR_MS;

    // Clean old timestamps
    this.tracker.txTimestamps = this.tracker.txTimestamps.filter(t => t > oneHourAgo);
    this.tracker.recentRecipients = this.tracker.recentRecipients.slice(-100);

    // Check 1: Velocity — max tx per hour
    if (this.tracker.txTimestamps.length >= ad.maxTxPerHour) {
      return `Velocity anomaly: ${this.tracker.txTimestamps.length} transactions in the last hour (limit: ${ad.maxTxPerHour})`;
    }

    // Check 2: Recipient spread — max unique recipients per hour
    const recentUniqueRecipients = new Set(
      this.tracker.recentRecipients.filter((_, i) =>
        this.tracker.txTimestamps[i] && this.tracker.txTimestamps[i] > oneHourAgo
      )
    );
    if (recentUniqueRecipients.size >= ad.maxRecipientsPerHour) {
      return `Recipient anomaly: ${recentUniqueRecipients.size} unique recipients in last hour (limit: ${ad.maxRecipientsPerHour})`;
    }

    // Check 3: Large transaction — % of daily limit
    const pctOfDaily = Number(value * 100n / this.policy.dailyLimit);
    if (pctOfDaily >= ad.largeTransactionPct) {
      return `Large transaction: ${pctOfDaily}% of daily limit in single tx (threshold: ${ad.largeTransactionPct}%)`;
    }

    // Check 4: Recipient novelty — new recipient + high value
    const noveltyPct = ad.recipientNoveltyPct ?? 30;
    const toLower = to.toLowerCase();
    const isNewRecipient = !this.tracker.recentRecipients.includes(toLower);
    if (isNewRecipient && pctOfDaily >= noveltyPct) {
      return `Novel recipient with high value: ${pctOfDaily}% of daily limit to unseen address`;
    }

    // Check 5: Burst detection — N txs within short window
    const burstWindow = ad.burstWindowMs ?? 120_000; // 2 min default
    const burstThreshold = ad.burstThreshold ?? 3;
    const recentBurst = this.tracker.txTimestamps.filter(t => t > now - burstWindow);
    if (recentBurst.length >= burstThreshold) {
      return `Burst detected: ${recentBurst.length} transactions in ${burstWindow / 1000}s window (threshold: ${burstThreshold})`;
    }

    // Check 6: Progressive escalation — monotonically increasing amounts
    const escWindowSize = ad.escalationWindowSize ?? 5;
    const amounts = this.tracker.recentAmounts.slice(-escWindowSize);
    if (amounts.length >= escWindowSize) {
      let increasing = true;
      for (let i = 1; i < amounts.length; i++) {
        if (amounts[i] <= amounts[i - 1]) { increasing = false; break; }
      }
      if (increasing && value > amounts[amounts.length - 1]) {
        return `Escalation pattern: last ${escWindowSize} transactions monotonically increasing`;
      }
    }

    // Check 7: Recipient concentration — >N% to single address
    const concentrationPct = ad.recipientConcentrationPct ?? 60;
    const totalRecentSpend = Object.values(this.tracker.recipientSpendMap)
      .reduce((sum, v) => sum + v, 0n);
    if (totalRecentSpend > 0n) {
      const recipientSpend = (this.tracker.recipientSpendMap[toLower] ?? 0n) + value;
      const pct = Number(recipientSpend * 100n / (totalRecentSpend + value));
      if (pct >= concentrationPct && Object.keys(this.tracker.recipientSpendMap).length >= 3) {
        return `Recipient concentration: ${pct}% of spending to single address (threshold: ${concentrationPct}%)`;
      }
    }

    // Check 8: Statistical deviation — value vs running average
    if (this.tracker.recentAmounts.length >= 5 && ad.deviationMultiplier) {
      const nums = this.tracker.recentAmounts.map(Number);
      const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
      const stddev = Math.sqrt(variance);
      if (stddev > 0 && Number(value) > mean + stddev * ad.deviationMultiplier) {
        return `Statistical deviation: value ${value} is ${((Number(value) - mean) / stddev).toFixed(1)} std devs above mean`;
      }
    }

    return null;
  }

  // ============ Risk Scoring (weighted factors) ============

  private calculateRiskFactors(to: string, value: bigint): RiskFactors {
    const toLower = to.toLowerCase();

    // Factor 1: Value ratio (how close to max per tx)
    const valueRatio = this.policy.maxPerTx > 0n
      ? Math.min(Number(value * 100n / this.policy.maxPerTx) / 100, 1) : 0;

    // Factor 2: Daily burn rate
    const dailyBurnRate = this.policy.dailyLimit > 0n
      ? Math.min(Number((this.tracker.spent + value) * 100n / this.policy.dailyLimit) / 100, 1) : 0;

    // Factor 3: Recipient novelty
    const recipientHistory = this.tracker.recentRecipients.filter(r => r === toLower).length;
    const recipientNovelty = recipientHistory === 0 ? 1.0 : recipientHistory < 3 ? 0.5 : 0.0;

    // Factor 4: Velocity
    const oneHourAgo = Date.now() - ONE_HOUR_MS;
    const txInLastHour = this.tracker.txTimestamps.filter(t => t > oneHourAgo).length;
    const maxTxPerHour = this.policy.anomalyDetection?.maxTxPerHour ?? 10;
    const velocityFactor = Math.min(txInLastHour / maxTxPerHour, 1);

    // Factor 5: Timing (burst detection)
    const burstWindow = this.policy.anomalyDetection?.burstWindowMs ?? 120_000;
    const recentBurst = this.tracker.txTimestamps.filter(t => t > Date.now() - burstWindow).length;
    const timingFactor = recentBurst >= 3 ? 1.0 : recentBurst >= 2 ? 0.5 : 0.0;

    // Factor 6: Escalation
    const amounts = this.tracker.recentAmounts.slice(-5);
    let escalationFactor = 0;
    if (amounts.length >= 3) {
      let increasing = true;
      for (let i = 1; i < amounts.length; i++) {
        if (amounts[i] <= amounts[i - 1]) { increasing = false; break; }
      }
      if (increasing && value > (amounts[amounts.length - 1] ?? 0n)) escalationFactor = 1.0;
    }

    // Factor 7: Concentration
    const totalSpend = Object.values(this.tracker.recipientSpendMap).reduce((s, v) => s + v, 0n);
    const recipientSpend = (this.tracker.recipientSpendMap[toLower] ?? 0n) + value;
    const concentrationFactor = totalSpend + value > 0n
      ? Math.min(Number(recipientSpend * 100n / (totalSpend + value)) / 100, 1) : 0;

    // Factor 8: Statistical deviation
    let deviationFactor = 0;
    if (this.tracker.recentAmounts.length >= 5) {
      const nums = this.tracker.recentAmounts.map(Number);
      const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
      const stddev = Math.sqrt(variance);
      if (stddev > 0) {
        deviationFactor = Math.min(Math.max((Number(value) - mean) / (stddev * 3), 0), 1);
      }
    }

    return {
      valueRatio, dailyBurnRate, recipientNovelty, velocityFactor,
      timingFactor, escalationFactor, concentrationFactor, deviationFactor,
    };
  }

  private computeRiskScore(factors: RiskFactors): number {
    const weights = {
      valueRatio: 0.20,
      dailyBurnRate: 0.18,
      recipientNovelty: 0.15,
      velocityFactor: 0.12,
      timingFactor: 0.10,
      escalationFactor: 0.10,
      concentrationFactor: 0.08,
      deviationFactor: 0.07,
    };

    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      score += (factors[key as keyof RiskFactors] ?? 0) * weight;
    }

    return Math.min(Math.round(score * 100), 100);
  }

  // ============ Tiered Authorization ============

  private resolveTier(value: bigint) {
    const tiers = this.policy.tieredAuthorization?.tiers;
    if (!tiers) return null;
    // Tiers should be sorted ascending by maxValue
    for (const tier of tiers) {
      if (value <= tier.maxValue) return tier;
    }
    // If value exceeds all tiers, use the last one
    return tiers[tiers.length - 1];
  }

  // ============ State Management ============

  recordTransaction(value: bigint, recipient?: string): void {
    this.resetWindowIfExpired();
    this.resetWeeklyWindowIfExpired();
    this.resetMonthlyWindowIfExpired();

    this.tracker.spent += value;
    this.tracker.weeklySpent += value;
    this.tracker.monthlySpent += value;
    this.tracker.lastTxTimestamp = Date.now();
    this.tracker.txTimestamps.push(Date.now());
    this.tracker.txCount++;

    this.tracker.recentAmounts.push(value);
    if (this.tracker.recentAmounts.length > 20) {
      this.tracker.recentAmounts = this.tracker.recentAmounts.slice(-20);
    }

    if (recipient) {
      const rLower = recipient.toLowerCase();
      this.tracker.recentRecipients.push(rLower);
      this.tracker.recipientSpendMap[rLower] =
        (this.tracker.recipientSpendMap[rLower] ?? 0n) + value;
    }
  }

  getSpendingStatus(): {
    spent: bigint; remaining: bigint; windowResets: number;
    weeklySpent?: bigint; weeklyRemaining?: bigint;
    monthlySpent?: bigint; monthlyRemaining?: bigint;
    txCount: number;
  } {
    this.resetWindowIfExpired();
    const result: ReturnType<PolicyEngine['getSpendingStatus']> = {
      spent: this.tracker.spent,
      remaining: this.policy.dailyLimit - this.tracker.spent,
      windowResets: this.tracker.windowStart + ONE_DAY_MS,
      txCount: this.tracker.txCount,
    };
    if (this.policy.weeklyLimit) {
      this.resetWeeklyWindowIfExpired();
      result.weeklySpent = this.tracker.weeklySpent;
      result.weeklyRemaining = this.policy.weeklyLimit - this.tracker.weeklySpent;
    }
    if (this.policy.monthlyLimit) {
      this.resetMonthlyWindowIfExpired();
      result.monthlySpent = this.tracker.monthlySpent;
      result.monthlyRemaining = this.policy.monthlyLimit - this.tracker.monthlySpent;
    }
    return result;
  }

  updatePolicy(updates: Partial<AgentPolicy>): void {
    Object.assign(this.policy, updates);
  }

  getPolicy(): Readonly<AgentPolicy> {
    return this.policy;
  }

  // ============ Window Resets ============

  private resetWindowIfExpired(): void {
    const now = Date.now();
    if (now > this.tracker.windowStart + ONE_DAY_MS) {
      this.tracker.spent = 0n;
      this.tracker.windowStart = now;
      this.tracker.txCount = 0;
    }
  }

  private resetWeeklyWindowIfExpired(): void {
    const now = Date.now();
    if (now > this.tracker.weeklyWindowStart + ONE_WEEK_MS) {
      this.tracker.weeklySpent = 0n;
      this.tracker.weeklyWindowStart = now;
    }
  }

  private resetMonthlyWindowIfExpired(): void {
    const now = Date.now();
    if (now > this.tracker.monthlyWindowStart + ONE_MONTH_MS) {
      this.tracker.monthlySpent = 0n;
      this.tracker.monthlyWindowStart = now;
    }
  }
}
