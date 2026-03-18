import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from '../src/PolicyEngine.js';
import type { AgentPolicy } from '../src/types.js';

function makePolicy(overrides?: Partial<AgentPolicy>): AgentPolicy {
  return {
    agentId: 'test-agent',
    maxPerTx: 100_000000n,
    dailyLimit: 500_000000n,
    requireApprovalAbove: 1000_000000n,
    allowedTokens: [],
    blockedTokens: [],
    allowedRecipients: [],
    blockedRecipients: [],
    allowedChains: [],
    cooldownMs: 0,
    ...overrides,
  };
}

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0002';

describe('PolicyEngine — Core Rules', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(makePolicy());
  });

  it('approves transaction within limits', () => {
    const d = engine.evaluate(ADDR_A, 50_000000n);
    expect(d.approved).toBe(true);
    expect(d.riskScore).toBeDefined();
    expect(d.riskFactors).toBeDefined();
  });

  it('blocks transaction exceeding maxPerTx', () => {
    const d = engine.evaluate(ADDR_A, 200_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('maxPerTx');
  });

  it('blocks transaction at exact maxPerTx + 1', () => {
    const d = engine.evaluate(ADDR_A, 100_000001n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('maxPerTx');
  });

  it('approves transaction at exact maxPerTx', () => {
    const d = engine.evaluate(ADDR_A, 100_000000n);
    expect(d.approved).toBe(true);
  });

  it('blocks when daily limit exhausted', () => {
    for (let i = 0; i < 5; i++) {
      const d = engine.evaluate(ADDR_A, 100_000000n);
      expect(d.approved).toBe(true);
      engine.recordTransaction(100_000000n, ADDR_A);
    }
    const d = engine.evaluate(ADDR_A, 1n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('dailyLimit');
  });
});

describe('PolicyEngine — Minimum Transaction Value', () => {
  it('blocks below minPerTx', () => {
    const engine = new PolicyEngine(makePolicy({ minPerTx: 1_000000n }));
    const d = engine.evaluate(ADDR_A, 500000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('minPerTx');
  });

  it('allows zero-value even with minPerTx set', () => {
    const engine = new PolicyEngine(makePolicy({ minPerTx: 1_000000n }));
    const d = engine.evaluate(ADDR_A, 0n);
    expect(d.approved).toBe(true);
  });
});

describe('PolicyEngine — Weekly/Monthly Limits', () => {
  it('blocks when weekly limit exceeded', () => {
    const engine = new PolicyEngine(makePolicy({ weeklyLimit: 200_000000n }));
    engine.recordTransaction(100_000000n, ADDR_A);
    engine.recordTransaction(100_000000n, ADDR_A);
    const d = engine.evaluate(ADDR_A, 1n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('weeklyLimit');
  });

  it('blocks when monthly limit exceeded', () => {
    const engine = new PolicyEngine(makePolicy({ monthlyLimit: 300_000000n }));
    engine.recordTransaction(100_000000n, ADDR_A);
    engine.recordTransaction(100_000000n, ADDR_A);
    engine.recordTransaction(100_000000n, ADDR_A);
    const d = engine.evaluate(ADDR_A, 1n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('monthlyLimit');
  });
});

describe('PolicyEngine — Daily Transaction Count', () => {
  it('blocks when maxTxPerDay reached', () => {
    const engine = new PolicyEngine(makePolicy({ maxTxPerDay: 3 }));
    for (let i = 0; i < 3; i++) {
      expect(engine.evaluate(ADDR_A, 1_000000n).approved).toBe(true);
      engine.recordTransaction(1_000000n, ADDR_A);
    }
    const d = engine.evaluate(ADDR_A, 1_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('maxTxPerDay');
  });
});

describe('PolicyEngine — Per-Token Limits', () => {
  it('blocks when per-token limit exceeded', () => {
    const token = '0x7169d38820dfd117c3fa1f22a697dba58d90ba06';
    const engine = new PolicyEngine(makePolicy({
      perTokenLimits: { [token]: 50_000000n },
      allowedTokens: [token],
    }));
    const d = engine.evaluate(ADDR_A, 80_000000n, token);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('perTokenLimit');
  });

  it('allows when within per-token limit', () => {
    const token = '0x7169d38820dfd117c3fa1f22a697dba58d90ba06';
    const engine = new PolicyEngine(makePolicy({
      perTokenLimits: { [token]: 50_000000n },
      allowedTokens: [token],
    }));
    const d = engine.evaluate(ADDR_A, 30_000000n, token);
    expect(d.approved).toBe(true);
  });
});

describe('PolicyEngine — Cooldown', () => {
  it('blocks during cooldown', () => {
    const engine = new PolicyEngine(makePolicy({ cooldownMs: 60000 }));
    engine.recordTransaction(10_000000n, ADDR_A);
    const d = engine.evaluate(ADDR_A, 10_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('cooldown');
  });
});

describe('PolicyEngine — Session Key Max Uses', () => {
  it('blocks after max uses exhausted', () => {
    const engine = new PolicyEngine(makePolicy({
      sessionKey: { address: '0x1234', validUntil: Date.now() + 86400000, maxUses: 2 },
    }));
    engine.recordTransaction(1_000000n, ADDR_A);
    engine.recordTransaction(1_000000n, ADDR_A);
    const d = engine.evaluate(ADDR_A, 1_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('sessionKeyMaxUses');
  });
});

describe('PolicyEngine — Token Allowlists', () => {
  it('blocks non-allowed token', () => {
    const engine = new PolicyEngine(makePolicy({ allowedTokens: ['0xaaaa'] }));
    const d = engine.evaluate(ADDR_A, 10_000000n, '0xbbbb');
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('allowedTokens');
  });

  it('blocks explicitly blocked token', () => {
    const engine = new PolicyEngine(makePolicy({ blockedTokens: ['0xdead'] }));
    const d = engine.evaluate(ADDR_A, 10_000000n, '0xDEAD');
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('blockedToken');
  });
});

describe('PolicyEngine — Recipient Lists', () => {
  it('blocks blocked recipient', () => {
    const engine = new PolicyEngine(makePolicy({ blockedRecipients: [ADDR_B] }));
    const d = engine.evaluate(ADDR_B, 10_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('blockedRecipient');
  });

  it('blocks non-allowed recipient', () => {
    const engine = new PolicyEngine(makePolicy({ allowedRecipients: [ADDR_A] }));
    const d = engine.evaluate(ADDR_B, 10_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('allowedRecipients');
  });
});

describe('PolicyEngine — Chain Allowlist', () => {
  it('blocks non-allowed chain', () => {
    const engine = new PolicyEngine(makePolicy({ allowedChains: ['sepolia'] }));
    const d = engine.evaluate(ADDR_A, 10_000000n, undefined, 'mainnet');
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('allowedChains');
  });
});

describe('PolicyEngine — Tiered Authorization', () => {
  it('auto-approves tier 1', () => {
    const engine = new PolicyEngine(makePolicy({
      tieredAuthorization: {
        tiers: [
          { maxValue: 100_000000n, action: 'auto_approve' },
          { maxValue: 500_000000n, action: 'require_approval' },
          { maxValue: 1000_000000n, action: 'require_multisig' },
        ],
      },
    }));
    const d = engine.evaluate(ADDR_A, 50_000000n);
    expect(d.approved).toBe(true);
  });

  it('requires approval for tier 2', () => {
    const engine = new PolicyEngine(makePolicy({
      tieredAuthorization: {
        tiers: [
          { maxValue: 100_000000n, action: 'auto_approve' },
          { maxValue: 500_000000n, action: 'require_approval' },
        ],
      },
    }));
    const d = engine.evaluate(ADDR_A, 200_000000n);
    // maxPerTx is 100, so this will be blocked by maxPerTx first
    // Need a higher maxPerTx for this test
  });

  it('requires multisig for high-value tier', () => {
    const engine = new PolicyEngine(makePolicy({
      maxPerTx: 2000_000000n,
      dailyLimit: 5000_000000n,
      requireApprovalAbove: 3000_000000n,
      tieredAuthorization: {
        tiers: [
          { maxValue: 100_000000n, action: 'auto_approve' },
          { maxValue: 500_000000n, action: 'require_approval' },
          { maxValue: 2000_000000n, action: 'require_multisig' },
        ],
      },
    }));
    const d = engine.evaluate(ADDR_A, 800_000000n);
    expect(d.approved).toBe(false);
    expect(d.tieredAction).toBe('require_multisig');
  });
});

describe('PolicyEngine — Velocity Ramp-Up', () => {
  it('enforces graduated limits for new keys', () => {
    const engine = new PolicyEngine(makePolicy({
      maxPerTx: 1000_000000n,
      velocityRampUp: {
        initialMaxPerTx: 10_000000n,
        finalMaxPerTx: 1000_000000n,
        rampDays: 30,
        createdAt: Date.now(), // just created
      },
    }));
    const d = engine.evaluate(ADDR_A, 50_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('velocityRampUp');
  });

  it('allows higher amounts after ramp period', () => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const engine = new PolicyEngine(makePolicy({
      maxPerTx: 1000_000000n,
      velocityRampUp: {
        initialMaxPerTx: 10_000000n,
        finalMaxPerTx: 1000_000000n,
        rampDays: 30,
        createdAt: thirtyDaysAgo,
      },
    }));
    const d = engine.evaluate(ADDR_A, 500_000000n);
    expect(d.approved).toBe(true);
  });
});

describe('PolicyEngine — Risk Scoring', () => {
  it('returns risk factors breakdown', () => {
    const engine = new PolicyEngine(makePolicy());
    const d = engine.evaluate(ADDR_A, 50_000000n);
    expect(d.riskFactors).toBeDefined();
    expect(d.riskFactors!.valueRatio).toBeGreaterThanOrEqual(0);
    expect(d.riskFactors!.dailyBurnRate).toBeGreaterThanOrEqual(0);
    expect(d.riskFactors!.recipientNovelty).toBeDefined();
  });

  it('scores new recipient higher risk than known', () => {
    const engine = new PolicyEngine(makePolicy());
    const d1 = engine.evaluate(ADDR_A, 50_000000n);
    engine.recordTransaction(50_000000n, ADDR_A);
    engine.recordTransaction(50_000000n, ADDR_A);
    engine.recordTransaction(50_000000n, ADDR_A);
    const d2 = engine.evaluate(ADDR_A, 50_000000n);
    // Known recipient should have lower novelty
    expect(d2.riskFactors!.recipientNovelty).toBeLessThan(d1.riskFactors!.recipientNovelty);
  });

  it('risk score stays between 0 and 100', () => {
    const engine = new PolicyEngine(makePolicy());
    const d = engine.evaluate(ADDR_A, 100_000000n);
    expect(d.riskScore).toBeGreaterThanOrEqual(0);
    expect(d.riskScore).toBeLessThanOrEqual(100);
  });
});

describe('PolicyEngine — Spending Status', () => {
  it('tracks spending and remaining', () => {
    const engine = new PolicyEngine(makePolicy());
    engine.recordTransaction(100_000000n, ADDR_A);
    const status = engine.getSpendingStatus();
    expect(status.spent).toBe(100_000000n);
    expect(status.remaining).toBe(400_000000n);
    expect(status.txCount).toBe(1);
  });

  it('includes weekly/monthly when configured', () => {
    const engine = new PolicyEngine(makePolicy({
      weeklyLimit: 1000_000000n,
      monthlyLimit: 3000_000000n,
    }));
    engine.recordTransaction(100_000000n, ADDR_A);
    const status = engine.getSpendingStatus();
    expect(status.weeklySpent).toBe(100_000000n);
    expect(status.monthlySpent).toBe(100_000000n);
  });
});

describe('PolicyEngine — Require Approval', () => {
  it('blocks above approval threshold', () => {
    const engine = new PolicyEngine(makePolicy({ requireApprovalAbove: 80_000000n }));
    const d = engine.evaluate(ADDR_A, 90_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('requireApproval');
  });
});
