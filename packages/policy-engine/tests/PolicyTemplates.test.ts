import { describe, it, expect } from 'vitest';
import {
  conservativePolicy,
  moderatePolicy,
  aggressivePolicy,
  transferOnlyPolicy,
  defiPolicy,
  rampUpPolicy,
  tieredPolicy,
} from '../src/PolicyTemplates.js';
import { PolicyEngine } from '../src/PolicyEngine.js';

describe('Policy Templates', () => {
  it('conservative policy blocks high-value tx', () => {
    const policy = conservativePolicy('test');
    const engine = new PolicyEngine(policy);
    const d = engine.evaluate('0xrecipient', 20_000000n);
    expect(d.approved).toBe(false);
    expect(d.ruleTriggered).toBe('maxPerTx');
  });

  it('conservative policy has operating hours', () => {
    const policy = conservativePolicy('test');
    expect(policy.activeHoursUTC).toBeDefined();
    expect(policy.activeHoursUTC!.start).toBe(9);
    expect(policy.activeHoursUTC!.end).toBe(17);
  });

  it('moderate policy allows higher limits', () => {
    const policy = moderatePolicy('test');
    const engine = new PolicyEngine(policy);
    const d = engine.evaluate('0xrecipient', 50_000000n);
    expect(d.approved).toBe(true);
  });

  it('aggressive policy has generous limits', () => {
    const policy = aggressivePolicy('test');
    expect(policy.maxPerTx).toBe(500_000000n);
    expect(policy.dailyLimit).toBe(5000_000000n);
    expect(policy.maxTxPerDay).toBe(200);
  });

  it('transfer-only policy sets allowed tokens', () => {
    const policy = transferOnlyPolicy('test', ['0xusdt', '0xusdc']);
    expect(policy.allowedTokens).toEqual(['0xusdt', '0xusdc']);
  });

  it('defi policy includes health factor config', () => {
    const policy = defiPolicy('test');
    expect(policy.defiPolicy).toBeDefined();
    expect(policy.defiPolicy!.minHealthFactor).toBe(1.5);
  });

  it('ramp-up policy starts with low limits', () => {
    const policy = rampUpPolicy('test');
    expect(policy.velocityRampUp).toBeDefined();
    expect(policy.velocityRampUp!.initialMaxPerTx).toBe(5_000000n);
    expect(policy.velocityRampUp!.rampDays).toBe(30);
  });

  it('tiered policy has 4 authorization tiers', () => {
    const policy = tieredPolicy('test');
    expect(policy.tieredAuthorization).toBeDefined();
    expect(policy.tieredAuthorization!.tiers).toHaveLength(4);
    expect(policy.tieredAuthorization!.tiers[0].action).toBe('auto_approve');
    expect(policy.tieredAuthorization!.tiers[3].action).toBe('require_multisig');
  });
});
