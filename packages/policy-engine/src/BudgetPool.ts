/**
 * Cross-agent budget coordination.
 *
 * Multiple agents can share a combined spending pool.
 * If Agent A spends 400/500, Agent B's effective limit drops to 100.
 * Prevents coordinated drain attacks across multiple compromised agents.
 */

export interface BudgetPoolConfig {
  poolId: string;
  totalDailyLimit: bigint;
  totalWeeklyLimit?: bigint;
  agentIds: string[];
}

interface PoolTracker {
  spent: bigint;
  windowStart: number;
  weeklySpent: bigint;
  weeklyWindowStart: number;
  agentSpend: Record<string, bigint>;
}

const ONE_DAY_MS = 86400_000;
const ONE_WEEK_MS = 604800_000;

export class BudgetPool {
  private config: BudgetPoolConfig;
  private tracker: PoolTracker;

  constructor(config: BudgetPoolConfig) {
    this.config = config;
    this.tracker = {
      spent: 0n,
      windowStart: Date.now(),
      weeklySpent: 0n,
      weeklyWindowStart: Date.now(),
      agentSpend: {},
    };
  }

  /**
   * Check if a transaction from an agent would exceed the shared pool limits.
   */
  canSpend(agentId: string, amount: bigint): { allowed: boolean; reason?: string } {
    this.resetIfExpired();

    if (!this.config.agentIds.includes(agentId)) {
      return { allowed: false, reason: `Agent ${agentId} not in pool ${this.config.poolId}` };
    }

    if (this.tracker.spent + amount > this.config.totalDailyLimit) {
      return {
        allowed: false,
        reason: `Pool ${this.config.poolId} daily limit exceeded: ${this.tracker.spent + amount}/${this.config.totalDailyLimit}`,
      };
    }

    if (this.config.totalWeeklyLimit) {
      this.resetWeeklyIfExpired();
      if (this.tracker.weeklySpent + amount > this.config.totalWeeklyLimit) {
        return {
          allowed: false,
          reason: `Pool ${this.config.poolId} weekly limit exceeded`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a spend from an agent against the shared pool.
   */
  recordSpend(agentId: string, amount: bigint): void {
    this.resetIfExpired();
    this.tracker.spent += amount;
    this.tracker.weeklySpent += amount;
    this.tracker.agentSpend[agentId] = (this.tracker.agentSpend[agentId] ?? 0n) + amount;
  }

  /**
   * Get the remaining budget available to any agent in the pool.
   */
  getRemainingBudget(): bigint {
    this.resetIfExpired();
    return this.config.totalDailyLimit - this.tracker.spent;
  }

  /**
   * Get per-agent spending within the pool.
   */
  getAgentSpend(agentId: string): bigint {
    return this.tracker.agentSpend[agentId] ?? 0n;
  }

  /**
   * Get pool status overview.
   */
  getStatus(): {
    poolId: string;
    totalSpent: bigint;
    remaining: bigint;
    agentBreakdown: Record<string, bigint>;
  } {
    this.resetIfExpired();
    return {
      poolId: this.config.poolId,
      totalSpent: this.tracker.spent,
      remaining: this.config.totalDailyLimit - this.tracker.spent,
      agentBreakdown: { ...this.tracker.agentSpend },
    };
  }

  private resetIfExpired(): void {
    const now = Date.now();
    if (now > this.tracker.windowStart + ONE_DAY_MS) {
      this.tracker.spent = 0n;
      this.tracker.windowStart = now;
      this.tracker.agentSpend = {};
    }
  }

  private resetWeeklyIfExpired(): void {
    const now = Date.now();
    if (now > this.tracker.weeklyWindowStart + ONE_WEEK_MS) {
      this.tracker.weeklySpent = 0n;
      this.tracker.weeklyWindowStart = now;
    }
  }
}
