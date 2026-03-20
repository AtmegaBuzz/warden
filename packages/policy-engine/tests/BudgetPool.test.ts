import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetPool } from '../src/BudgetPool.js';

describe('BudgetPool', () => {
  let pool: BudgetPool;

  beforeEach(() => {
    pool = new BudgetPool({
      poolId: 'test-pool',
      totalDailyLimit: 1000_000000n,
      agentIds: ['agent-1', 'agent-2', 'agent-3'],
    });
  });

  it('allows spend within pool limit', () => {
    const result = pool.canSpend('agent-1', 500_000000n);
    expect(result.allowed).toBe(true);
  });

  it('blocks spend exceeding pool limit', () => {
    pool.recordSpend('agent-1', 600_000000n);
    const result = pool.canSpend('agent-2', 500_000000n);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('daily limit exceeded');
  });

  it('rejects agents not in pool', () => {
    const result = pool.canSpend('rogue-agent', 100_000000n);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in pool');
  });

  it('tracks per-agent spending', () => {
    pool.recordSpend('agent-1', 300_000000n);
    pool.recordSpend('agent-2', 200_000000n);
    expect(pool.getAgentSpend('agent-1')).toBe(300_000000n);
    expect(pool.getAgentSpend('agent-2')).toBe(200_000000n);
    expect(pool.getRemainingBudget()).toBe(500_000000n);
  });

  it('returns correct pool status', () => {
    pool.recordSpend('agent-1', 100_000000n);
    pool.recordSpend('agent-2', 200_000000n);
    const status = pool.getStatus();
    expect(status.poolId).toBe('test-pool');
    expect(status.totalSpent).toBe(300_000000n);
    expect(status.remaining).toBe(700_000000n);
    expect(status.agentBreakdown['agent-1']).toBe(100_000000n);
  });
});
