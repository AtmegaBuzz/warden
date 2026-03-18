import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../src/PolicyEngine.js';
import type { AgentPolicy } from '../src/types.js';

function makePolicy(overrides?: Partial<AgentPolicy>): AgentPolicy {
  return {
    agentId: 'anomaly-test',
    maxPerTx: 1000_000000n,
    dailyLimit: 5000_000000n,
    requireApprovalAbove: 10000_000000n,
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: [],
    cooldownMs: 0,
    anomalyDetection: {
      maxTxPerHour: 10,
      maxRecipientsPerHour: 5,
      largeTransactionPct: 50,
      burstWindowMs: 120_000,
      burstThreshold: 3,
      escalationWindowSize: 5,
      recipientConcentrationPct: 60,
      recipientNoveltyPct: 30,
      deviationMultiplier: 2.5,
    },
    ...overrides,
  };
}

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

describe('Anomaly Detection — Velocity', () => {
  it('blocks after maxTxPerHour exceeded', () => {
    const engine = new PolicyEngine(makePolicy());
    for (let i = 0; i < 10; i++) {
      engine.evaluate(addr(i), 10_000000n);
      engine.recordTransaction(10_000000n, addr(i));
    }
    const d = engine.evaluate(addr(99), 10_000000n);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain('Velocity anomaly');
  });
});

describe('Anomaly Detection — Recipient Spread', () => {
  it('blocks when too many unique recipients', () => {
    const engine = new PolicyEngine(makePolicy({
      anomalyDetection: {
        maxTxPerHour: 100,
        maxRecipientsPerHour: 3,
        largeTransactionPct: 80,
      },
    }));
    for (let i = 0; i < 3; i++) {
      engine.evaluate(addr(i + 1), 10_000000n);
      engine.recordTransaction(10_000000n, addr(i + 1));
    }
    const d = engine.evaluate(addr(99), 10_000000n);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain('Recipient anomaly');
  });
});

describe('Anomaly Detection — Large Transaction', () => {
  it('blocks single large transaction', () => {
    const engine = new PolicyEngine(makePolicy({
      maxPerTx: 5000_000000n, // raise max so it doesn't trigger first
      anomalyDetection: {
        maxTxPerHour: 100,
        maxRecipientsPerHour: 100,
        largeTransactionPct: 40,
      },
    }));
    const d = engine.evaluate(addr(1), 2500_000000n); // 50% of daily
    expect(d.approved).toBe(false);
    expect(d.reason).toContain('Large transaction');
  });
});

describe('Anomaly Detection — Burst', () => {
  it('detects rapid burst of transactions', () => {
    const engine = new PolicyEngine(makePolicy());
    // Simulate 3 transactions rapidly (within same burst window)
    for (let i = 0; i < 3; i++) {
      engine.evaluate(addr(1), 10_000000n);
      engine.recordTransaction(10_000000n, addr(1));
    }
    const d = engine.evaluate(addr(1), 10_000000n);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain('Burst detected');
  });
});

describe('Anomaly Detection — Escalation', () => {
  it('detects monotonically increasing amounts', () => {
    const engine = new PolicyEngine(makePolicy({
      anomalyDetection: {
        maxTxPerHour: 100,
        maxRecipientsPerHour: 100,
        largeTransactionPct: 80,
        burstThreshold: 100, // disable burst detection
        escalationWindowSize: 5,
      },
    }));
    const amounts = [1_000000n, 5_000000n, 20_000000n, 80_000000n, 200_000000n];
    for (const amount of amounts) {
      engine.recordTransaction(amount, addr(1));
    }
    const d = engine.evaluate(addr(1), 500_000000n);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain('Escalation pattern');
  });

  it('does not flag non-monotonic sequences', () => {
    const engine = new PolicyEngine(makePolicy({
      anomalyDetection: {
        maxTxPerHour: 100,
        maxRecipientsPerHour: 100,
        largeTransactionPct: 80,
        burstThreshold: 100, // disable burst detection
        escalationWindowSize: 5,
      },
    }));
    const amounts = [10_000000n, 5_000000n, 20_000000n, 15_000000n, 10_000000n];
    for (const amount of amounts) {
      engine.recordTransaction(amount, addr(1));
    }
    const d = engine.evaluate(addr(1), 15_000000n);
    expect(d.ruleTriggered).not.toBe('anomalyDetection');
  });
});

describe('Anomaly Detection — Recipient Novelty', () => {
  it('flags high value to new recipient', () => {
    const engine = new PolicyEngine(makePolicy({
      maxPerTx: 5000_000000n, // raise max so it doesn't trigger first
      anomalyDetection: {
        maxTxPerHour: 100,
        maxRecipientsPerHour: 100,
        largeTransactionPct: 80,
        recipientNoveltyPct: 20,
        burstThreshold: 100,
      },
    }));
    engine.recordTransaction(10_000000n, addr(1));
    const d = engine.evaluate(addr(99), 1500_000000n); // 30% of daily
    expect(d.approved).toBe(false);
    expect(d.reason).toContain('Novel recipient');
  });
});

describe('Anomaly Detection — Concentration', () => {
  it('flags when spending concentrated on one address', () => {
    const engine = new PolicyEngine(makePolicy({
      anomalyDetection: {
        maxTxPerHour: 100,
        maxRecipientsPerHour: 100,
        largeTransactionPct: 80,
        recipientConcentrationPct: 60,
        burstThreshold: 100, // disable burst
      },
    }));
    engine.recordTransaction(10_000000n, addr(1));
    engine.recordTransaction(10_000000n, addr(2));
    engine.recordTransaction(10_000000n, addr(3));
    engine.recordTransaction(100_000000n, addr(1));
    engine.recordTransaction(100_000000n, addr(1));
    const d = engine.evaluate(addr(1), 100_000000n);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain('Recipient concentration');
  });
});
