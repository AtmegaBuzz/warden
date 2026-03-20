import { describe, it, expect, beforeEach } from 'vitest';
import { ContractRiskClassifier } from '../src/ContractRiskClassifier.js';

describe('ContractRiskClassifier', () => {
  let classifier: ContractRiskClassifier;

  beforeEach(() => {
    classifier = new ContractRiskClassifier();
  });

  it('classifies known protocols as low risk', () => {
    // Aave V3
    const result = classifier.classify('0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2');
    expect(result.level).toBe('low');
    expect(result.label).toBe('Aave V3 Pool');
  });

  it('classifies known tokens as low risk', () => {
    const result = classifier.classify('0xdAC17F958D2ee523a2206206994597C13D831ec7');
    expect(result.level).toBe('low');
    expect(result.label).toBe('USDT');
  });

  it('classifies unknown contracts as medium risk', () => {
    const result = classifier.classify('0x1234567890123456789012345678901234567890');
    expect(result.level).toBe('medium');
    expect(result.reason).toBe('Unknown contract');
  });

  it('respects custom classifications', () => {
    classifier.registerContract('0xdeadbeef', 'critical', 'Malicious Contract');
    const result = classifier.classify('0xdeadbeef');
    expect(result.level).toBe('critical');
    expect(result.label).toBe('Malicious Contract');
  });

  it('calculates max value per risk level', () => {
    const base = 100_000000n;
    expect(classifier.getMaxValueForRisk('low', base)).toBe(100_000000n);
    expect(classifier.getMaxValueForRisk('medium', base)).toBe(50_000000n);
    expect(classifier.getMaxValueForRisk('high', base)).toBe(20_000000n);
    expect(classifier.getMaxValueForRisk('critical', base)).toBe(0n);
  });

  it('checks if address is known protocol', () => {
    expect(classifier.isKnownProtocol('0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2')).toBe(true);
    expect(classifier.isKnownProtocol('0x1234567890123456789012345678901234567890')).toBe(false);
  });

  it('handles case-insensitive addresses', () => {
    const result = classifier.classify('0xDAC17F958D2EE523A2206206994597C13D831EC7');
    expect(result.level).toBe('low');
  });
});
