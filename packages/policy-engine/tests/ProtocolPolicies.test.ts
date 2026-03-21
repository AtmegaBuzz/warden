import { describe, it, expect } from 'vitest';
import {
  ERC20_SELECTORS,
  AAVE_V3_SELECTORS,
  UNISWAP_V3_SELECTORS,
  TRANSFER_ONLY,
  AAVE_SUPPLY_ONLY,
  AAVE_FULL,
  UNISWAP_SWAP_ONLY,
  READ_ONLY,
  getAllProtocolPolicies,
} from '../src/ProtocolPolicies.js';

describe('Protocol Policies', () => {
  it('ERC-20 selectors are 4-byte hex strings', () => {
    expect(ERC20_SELECTORS.transfer).toMatch(/^0x[a-f0-9]{8}$/);
    expect(ERC20_SELECTORS.approve).toMatch(/^0x[a-f0-9]{8}$/);
    expect(ERC20_SELECTORS.transferFrom).toMatch(/^0x[a-f0-9]{8}$/);
  });

  it('Aave V3 selectors are 4-byte hex strings', () => {
    for (const selector of Object.values(AAVE_V3_SELECTORS)) {
      expect(selector).toMatch(/^0x[a-f0-9]{8}$/);
    }
  });

  it('Uniswap V3 selectors are 4-byte hex strings', () => {
    for (const selector of Object.values(UNISWAP_V3_SELECTORS)) {
      expect(selector).toMatch(/^0x[a-f0-9]{8}$/);
    }
  });

  it('Transfer Only allows only transfer()', () => {
    expect(TRANSFER_ONLY.allowedSelectors).toHaveLength(1);
    expect(TRANSFER_ONLY.allowedSelectors).toContain(ERC20_SELECTORS.transfer);
  });

  it('Aave Supply Only blocks borrow', () => {
    expect(AAVE_SUPPLY_ONLY.blockedSelectors).toContain(AAVE_V3_SELECTORS.borrow);
    expect(AAVE_SUPPLY_ONLY.allowedSelectors).toContain(AAVE_V3_SELECTORS.supply);
    expect(AAVE_SUPPLY_ONLY.allowedSelectors).toContain(AAVE_V3_SELECTORS.withdraw);
  });

  it('Aave Full includes all 4 operations + approve', () => {
    expect(AAVE_FULL.allowedSelectors.length).toBeGreaterThanOrEqual(5);
  });

  it('Read Only has empty selectors', () => {
    expect(READ_ONLY.allowedSelectors).toHaveLength(0);
  });

  it('getAllProtocolPolicies returns all 5 presets', () => {
    const policies = getAllProtocolPolicies();
    expect(policies).toHaveLength(5);
    const names = policies.map(p => p.name);
    expect(names).toContain('Transfer Only');
    expect(names).toContain('Read Only');
  });
});
